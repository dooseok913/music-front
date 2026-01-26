"""
Neural Collaborative Filtering (NCF) 기반 음악 추천 시스템

딥러닝 모델:
- GMF (Generalized Matrix Factorization): 사용자-트랙 임베딩의 element-wise product
- MLP (Multi-Layer Perceptron): 비선형 상호작용 학습
- NCF: GMF + MLP 결합

실행: cd server/ml && python train_ncf.py
"""

import os
import sys
import json
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
import numpy as np
import mysql.connector
from datetime import datetime

# UTF-8 출력 설정
sys.stdout.reconfigure(encoding='utf-8')

# 설정
DEVICE = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
EMBEDDING_DIM = 64
HIDDEN_LAYERS = [128, 64, 32]
LEARNING_RATE = 0.001
BATCH_SIZE = 256
EPOCHS = 50
NEGATIVE_SAMPLES = 4  # 각 positive sample당 negative samples 수

print(f"[NCF] Device: {DEVICE}")

# ============================================
# 1. 데이터베이스 연결 및 데이터 로드
# ============================================

def get_db_connection():
    return mysql.connector.connect(
        host=os.environ.get('DB_HOST', 'localhost'),
        port=int(os.environ.get('DB_PORT', 3307)),
        user=os.environ.get('DB_USER', 'root'),
        password=os.environ.get('DB_PASSWORD', '0000'),
        database=os.environ.get('DB_NAME', 'music_space_db')
    )

def load_training_data(user_id):
    """사용자의 플레이리스트에서 학습 데이터 로드"""
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)

    # 사용자가 플레이리스트에 추가한 트랙 = positive interactions
    cursor.execute("""
        SELECT DISTINCT
            pt.track_id,
            t.artist,
            t.popularity,
            t.duration,
            1 as interaction
        FROM playlist_tracks pt
        JOIN playlists p ON pt.playlist_id = p.playlist_id
        JOIN tracks t ON pt.track_id = t.track_id
        WHERE p.user_id = %s AND p.space_type = 'PMS'
    """, (user_id,))
    positive_tracks = cursor.fetchall()

    # 전체 트랙 목록 (negative sampling용)
    cursor.execute("""
        SELECT DISTINCT track_id, artist, popularity, duration
        FROM tracks
        WHERE track_id IS NOT NULL
    """)
    all_tracks = cursor.fetchall()

    cursor.close()
    conn.close()

    return positive_tracks, all_tracks

def load_ems_tracks():
    """EMS 트랙 로드 (추천 대상)"""
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)

    cursor.execute("""
        SELECT DISTINCT
            t.track_id,
            t.title,
            t.artist,
            t.album,
            t.popularity,
            t.duration,
            t.artwork
        FROM tracks t
        JOIN playlist_tracks pt ON t.track_id = pt.track_id
        JOIN playlists p ON pt.playlist_id = p.playlist_id
        WHERE p.space_type = 'EMS'
    """)
    tracks = cursor.fetchall()

    cursor.close()
    conn.close()

    return tracks

# ============================================
# 2. 데이터 전처리
# ============================================

class MusicDataset(Dataset):
    """PyTorch Dataset for NCF"""

    def __init__(self, interactions, num_tracks, negative_samples=4):
        self.interactions = interactions
        self.num_tracks = num_tracks
        self.negative_samples = negative_samples
        self.positive_set = set(interactions)

        # Negative sampling으로 데이터 확장
        self.samples = []
        for track_id in interactions:
            # Positive sample
            self.samples.append((track_id, 1.0))

            # Negative samples
            for _ in range(negative_samples):
                neg_track = np.random.randint(1, num_tracks + 1)
                while neg_track in self.positive_set:
                    neg_track = np.random.randint(1, num_tracks + 1)
                self.samples.append((neg_track, 0.0))

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        track_id, label = self.samples[idx]
        return torch.tensor(track_id, dtype=torch.long), torch.tensor(label, dtype=torch.float32)

# ============================================
# 3. Neural Collaborative Filtering 모델
# ============================================

class GMF(nn.Module):
    """Generalized Matrix Factorization"""

    def __init__(self, num_tracks, embedding_dim):
        super(GMF, self).__init__()
        self.track_embedding = nn.Embedding(num_tracks + 1, embedding_dim)
        self.user_embedding = nn.Parameter(torch.randn(1, embedding_dim))

        # 초기화
        nn.init.normal_(self.track_embedding.weight, std=0.01)
        nn.init.normal_(self.user_embedding, std=0.01)

    def forward(self, track_ids):
        track_embed = self.track_embedding(track_ids)
        user_embed = self.user_embedding.expand(track_ids.size(0), -1)
        return track_embed * user_embed  # Element-wise product


class MLP(nn.Module):
    """Multi-Layer Perceptron"""

    def __init__(self, num_tracks, embedding_dim, hidden_layers):
        super(MLP, self).__init__()
        self.track_embedding = nn.Embedding(num_tracks + 1, embedding_dim)
        self.user_embedding = nn.Parameter(torch.randn(1, embedding_dim))

        # MLP layers
        layers = []
        input_dim = embedding_dim * 2
        for hidden_dim in hidden_layers:
            layers.append(nn.Linear(input_dim, hidden_dim))
            layers.append(nn.ReLU())
            layers.append(nn.BatchNorm1d(hidden_dim))
            layers.append(nn.Dropout(0.2))
            input_dim = hidden_dim

        self.mlp = nn.Sequential(*layers)

        # 초기화
        nn.init.normal_(self.track_embedding.weight, std=0.01)
        nn.init.normal_(self.user_embedding, std=0.01)

    def forward(self, track_ids):
        track_embed = self.track_embedding(track_ids)
        user_embed = self.user_embedding.expand(track_ids.size(0), -1)
        concat = torch.cat([track_embed, user_embed], dim=-1)
        return self.mlp(concat)


class NCF(nn.Module):
    """Neural Collaborative Filtering (GMF + MLP)"""

    def __init__(self, num_tracks, embedding_dim=64, hidden_layers=[128, 64, 32]):
        super(NCF, self).__init__()

        self.gmf = GMF(num_tracks, embedding_dim)
        self.mlp = MLP(num_tracks, embedding_dim, hidden_layers)

        # 최종 예측 레이어
        final_dim = embedding_dim + hidden_layers[-1]
        self.output_layer = nn.Sequential(
            nn.Linear(final_dim, 32),
            nn.ReLU(),
            nn.Linear(32, 1),
            nn.Sigmoid()
        )

    def forward(self, track_ids):
        gmf_out = self.gmf(track_ids)
        mlp_out = self.mlp(track_ids)
        concat = torch.cat([gmf_out, mlp_out], dim=-1)
        return self.output_layer(concat).squeeze()

# ============================================
# 4. 학습
# ============================================

def train_model(model, train_loader, epochs, lr):
    """모델 학습"""
    criterion = nn.BCELoss()
    optimizer = optim.Adam(model.parameters(), lr=lr, weight_decay=1e-5)
    scheduler = optim.lr_scheduler.StepLR(optimizer, step_size=10, gamma=0.5)

    model.train()
    history = {'loss': [], 'accuracy': []}

    for epoch in range(epochs):
        total_loss = 0
        correct = 0
        total = 0

        for batch_idx, (track_ids, labels) in enumerate(train_loader):
            track_ids = track_ids.to(DEVICE)
            labels = labels.to(DEVICE)

            optimizer.zero_grad()
            predictions = model(track_ids)
            loss = criterion(predictions, labels)

            loss.backward()
            optimizer.step()

            total_loss += loss.item()

            # Accuracy 계산
            predicted = (predictions > 0.5).float()
            correct += (predicted == labels).sum().item()
            total += labels.size(0)

        scheduler.step()

        avg_loss = total_loss / len(train_loader)
        accuracy = correct / total * 100
        history['loss'].append(avg_loss)
        history['accuracy'].append(accuracy)

        if (epoch + 1) % 5 == 0 or epoch == 0:
            print(f"  Epoch [{epoch+1}/{epochs}] Loss: {avg_loss:.4f}, Accuracy: {accuracy:.2f}%")

    return history

# ============================================
# 5. 추천 생성
# ============================================

def generate_recommendations(model, ems_tracks, track_id_map, top_k=30):
    """EMS 트랙에 대한 추천 점수 생성"""
    model.eval()
    recommendations = []

    with torch.no_grad():
        for track in ems_tracks:
            track_id = track['track_id']
            if track_id in track_id_map:
                mapped_id = track_id_map[track_id]
                track_tensor = torch.tensor([mapped_id], dtype=torch.long).to(DEVICE)
                score = model(track_tensor).item()

                recommendations.append({
                    'track_id': track_id,
                    'title': track['title'],
                    'artist': track['artist'],
                    'album': track.get('album'),
                    'popularity': track.get('popularity'),
                    'artwork': track.get('artwork'),
                    'ncf_score': round(score * 100, 2)  # 0-100 스케일
                })

    # 점수로 정렬
    recommendations.sort(key=lambda x: x['ncf_score'], reverse=True)
    return recommendations[:top_k]

# ============================================
# 6. 메인 실행
# ============================================

def main():
    print("=" * 60)
    print("🧠 Neural Collaborative Filtering 학습 시작")
    print("=" * 60)

    USER_ID = 3  # 학습 대상 사용자

    # 1. 데이터 로드
    print("\n📊 1단계: 데이터 로드")
    positive_tracks, all_tracks = load_training_data(USER_ID)
    ems_tracks = load_ems_tracks()

    print(f"   - Positive interactions: {len(positive_tracks)}")
    print(f"   - 전체 트랙 수: {len(all_tracks)}")
    print(f"   - EMS 트랙 수: {len(ems_tracks)}")

    if len(positive_tracks) < 10:
        print("[ERROR] 학습할 데이터가 부족합니다 (최소 10개 필요)")
        return

    # 2. 데이터 전처리
    print("\n🔧 2단계: 데이터 전처리")

    # Track ID 매핑 (연속적인 인덱스로)
    track_ids = [t['track_id'] for t in all_tracks]
    track_id_map = {tid: idx + 1 for idx, tid in enumerate(track_ids)}
    reverse_map = {idx + 1: tid for idx, tid in enumerate(track_ids)}
    num_tracks = len(track_ids)

    # Positive interactions를 매핑된 ID로 변환
    positive_mapped = [track_id_map[t['track_id']] for t in positive_tracks if t['track_id'] in track_id_map]

    print(f"   - 매핑된 positive samples: {len(positive_mapped)}")
    print(f"   - Negative samples per positive: {NEGATIVE_SAMPLES}")
    print(f"   - 총 학습 샘플: {len(positive_mapped) * (1 + NEGATIVE_SAMPLES)}")

    # Dataset & DataLoader
    dataset = MusicDataset(positive_mapped, num_tracks, NEGATIVE_SAMPLES)
    train_loader = DataLoader(dataset, batch_size=BATCH_SIZE, shuffle=True)

    # 3. 모델 생성
    print("\n🏗️ 3단계: NCF 모델 생성")
    model = NCF(
        num_tracks=num_tracks,
        embedding_dim=EMBEDDING_DIM,
        hidden_layers=HIDDEN_LAYERS
    ).to(DEVICE)

    total_params = sum(p.numel() for p in model.parameters())
    trainable_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"   - 총 파라미터: {total_params:,}")
    print(f"   - 학습 가능 파라미터: {trainable_params:,}")
    print(f"   - 임베딩 차원: {EMBEDDING_DIM}")
    print(f"   - Hidden layers: {HIDDEN_LAYERS}")

    # 4. 학습
    print(f"\n🎯 4단계: 모델 학습 (Epochs: {EPOCHS})")
    history = train_model(model, train_loader, EPOCHS, LEARNING_RATE)

    # 5. 모델 저장
    print("\n💾 5단계: 모델 저장")
    os.makedirs('models', exist_ok=True)

    model_path = f'models/ncf_user_{USER_ID}.pt'
    torch.save({
        'model_state_dict': model.state_dict(),
        'track_id_map': track_id_map,
        'reverse_map': reverse_map,
        'num_tracks': num_tracks,
        'embedding_dim': EMBEDDING_DIM,
        'hidden_layers': HIDDEN_LAYERS,
        'user_id': USER_ID,
        'trained_at': datetime.now().isoformat(),
        'history': history
    }, model_path)
    print(f"   [OK] 모델 저장: {model_path}")

    # 6. 추천 생성
    print("\n🎵 6단계: EMS 트랙 추천 생성")
    recommendations = generate_recommendations(model, ems_tracks, track_id_map, top_k=30)

    # 추천 결과 저장
    rec_path = f'models/recommendations_user_{USER_ID}.json'
    with open(rec_path, 'w', encoding='utf-8') as f:
        json.dump({
            'user_id': USER_ID,
            'generated_at': datetime.now().isoformat(),
            'model_info': {
                'type': 'NCF',
                'embedding_dim': EMBEDDING_DIM,
                'hidden_layers': HIDDEN_LAYERS,
                'epochs': EPOCHS,
                'final_loss': history['loss'][-1],
                'final_accuracy': history['accuracy'][-1]
            },
            'recommendations': recommendations
        }, f, ensure_ascii=False, indent=2)
    print(f"   [OK] 추천 결과 저장: {rec_path}")

    # 7. 결과 출력
    print("\n" + "=" * 60)
    print("🎉 학습 완료!")
    print("=" * 60)

    print(f"\n📈 학습 결과:")
    print(f"   - Final Loss: {history['loss'][-1]:.4f}")
    print(f"   - Final Accuracy: {history['accuracy'][-1]:.2f}%")

    print(f"\n🎵 Top 15 추천 트랙 (NCF Score):")
    print("-" * 60)
    for i, rec in enumerate(recommendations[:15], 1):
        print(f"  {i:2d}. [{rec['ncf_score']:5.1f}점] {rec['title'][:30]}")
        print(f"      └─ {rec['artist'][:35]}")

    print("\n[OK] 완료!")
    return recommendations

if __name__ == "__main__":
    main()
