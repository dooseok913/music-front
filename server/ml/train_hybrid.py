"""
Hybrid Deep Learning 음악 추천 시스템

NCF + Content-Based Features 결합:
- Track embeddings (collaborative)
- Content features: popularity, duration, artist embedding
- Multi-task learning: predict interaction + similarity

실행: cd server/ml && python train_hybrid.py
"""

import os
import sys
import json
import torch
import torch.nn as nn
import torch.optim as optim
import torch.nn.functional as F
from torch.utils.data import Dataset, DataLoader
import numpy as np
import mysql.connector
from datetime import datetime
from collections import defaultdict

sys.stdout.reconfigure(encoding='utf-8')

DEVICE = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
print(f"[Hybrid DL] Device: {DEVICE}")

# ============================================
# 하이퍼파라미터
# ============================================
EMBEDDING_DIM = 32
ARTIST_EMBEDDING_DIM = 16
HIDDEN_LAYERS = [64, 32]
LEARNING_RATE = 0.005
BATCH_SIZE = 128
EPOCHS = 30
MARGIN = 0.5  # Triplet loss margin

# ============================================
# DB 연결
# ============================================
def get_db():
    return mysql.connector.connect(
        host='localhost', port=3307,
        user='root', password='0000',
        database='music_space_db'
    )

# ============================================
# 데이터 로드
# ============================================
def load_data(user_id):
    conn = get_db()
    cur = conn.cursor(dictionary=True)

    # 사용자의 positive tracks (PMS)
    cur.execute("""
        SELECT DISTINCT t.track_id, t.artist, t.popularity, t.duration
        FROM tracks t
        JOIN playlist_tracks pt ON t.track_id = pt.track_id
        JOIN playlists p ON pt.playlist_id = p.playlist_id
        WHERE p.user_id = %s AND p.space_type = 'PMS'
    """, (user_id,))
    pos_tracks = cur.fetchall()

    # EMS 트랙 (추천 대상)
    cur.execute("""
        SELECT DISTINCT t.track_id, t.title, t.artist, t.album,
               t.popularity, t.duration, t.artwork
        FROM tracks t
        JOIN playlist_tracks pt ON t.track_id = pt.track_id
        JOIN playlists p ON pt.playlist_id = p.playlist_id
        WHERE p.space_type = 'EMS'
    """)
    ems_tracks = cur.fetchall()

    # 전체 아티스트 목록
    cur.execute("SELECT DISTINCT artist FROM tracks WHERE artist IS NOT NULL")
    artists = [r['artist'] for r in cur.fetchall()]

    cur.close()
    conn.close()

    return pos_tracks, ems_tracks, artists

# ============================================
# Feature Engineering
# ============================================
class FeatureEncoder:
    def __init__(self, artists):
        self.artist_to_idx = {a: i+1 for i, a in enumerate(artists)}
        self.num_artists = len(artists) + 1

    def encode_track(self, track):
        """트랙을 특성 벡터로 인코딩"""
        artist_idx = self.artist_to_idx.get(track.get('artist'), 0)
        popularity = (track.get('popularity') or 50) / 100.0
        duration = min((track.get('duration') or 240) / 600.0, 1.0)
        return {
            'artist_idx': artist_idx,
            'popularity': popularity,
            'duration': duration
        }

# ============================================
# Hybrid Model
# ============================================
class HybridRecommender(nn.Module):
    """
    하이브리드 추천 모델:
    1. Artist Embedding: 아티스트 표현 학습
    2. Content Network: 인기도, 재생시간 등 특성 처리
    3. User Profile: 사용자 선호도 표현
    4. Similarity Network: 사용자-트랙 유사도 계산
    """

    def __init__(self, num_artists, artist_embed_dim=16, hidden_dim=32):
        super().__init__()

        # Artist Embedding
        self.artist_embed = nn.Embedding(num_artists, artist_embed_dim)

        # Content feature network
        # Input: artist_embed(16) + popularity(1) + duration(1) = 18
        self.content_net = nn.Sequential(
            nn.Linear(artist_embed_dim + 2, hidden_dim),
            nn.ReLU(),
            nn.BatchNorm1d(hidden_dim),
            nn.Dropout(0.3),
            nn.Linear(hidden_dim, hidden_dim),
            nn.ReLU()
        )

        # User preference (learnable)
        self.user_pref = nn.Parameter(torch.randn(1, hidden_dim))

        # Similarity network
        self.sim_net = nn.Sequential(
            nn.Linear(hidden_dim * 2, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, 1),
            nn.Sigmoid()
        )

        self._init_weights()

    def _init_weights(self):
        nn.init.xavier_normal_(self.artist_embed.weight)
        nn.init.xavier_normal_(self.user_pref)

    def encode_track(self, artist_idx, popularity, duration):
        """트랙을 벡터로 인코딩"""
        artist_emb = self.artist_embed(artist_idx)
        content = torch.cat([
            artist_emb,
            popularity.unsqueeze(-1),
            duration.unsqueeze(-1)
        ], dim=-1)
        return self.content_net(content)

    def forward(self, artist_idx, popularity, duration):
        """사용자-트랙 선호도 점수 계산"""
        track_vec = self.encode_track(artist_idx, popularity, duration)
        user_vec = self.user_pref.expand(track_vec.size(0), -1)
        combined = torch.cat([user_vec, track_vec], dim=-1)
        return self.sim_net(combined).squeeze()

    def get_track_embedding(self, artist_idx, popularity, duration):
        """트랙 임베딩 추출 (추천용)"""
        return self.encode_track(artist_idx, popularity, duration)

# ============================================
# Dataset
# ============================================
class TripletDataset(Dataset):
    """Triplet Loss용 데이터셋: (anchor_user, positive_track, negative_track)"""

    def __init__(self, pos_tracks, all_tracks, encoder, neg_ratio=3):
        self.pos_features = [encoder.encode_track(t) for t in pos_tracks]
        self.neg_features = [encoder.encode_track(t) for t in all_tracks
                            if t['track_id'] not in {p['track_id'] for p in pos_tracks}]
        self.neg_ratio = neg_ratio

    def __len__(self):
        return len(self.pos_features) * self.neg_ratio

    def __getitem__(self, idx):
        pos_idx = idx % len(self.pos_features)
        neg_idx = np.random.randint(0, len(self.neg_features))

        pos = self.pos_features[pos_idx]
        neg = self.neg_features[neg_idx]

        return {
            'pos_artist': torch.tensor(pos['artist_idx'], dtype=torch.long),
            'pos_pop': torch.tensor(pos['popularity'], dtype=torch.float),
            'pos_dur': torch.tensor(pos['duration'], dtype=torch.float),
            'neg_artist': torch.tensor(neg['artist_idx'], dtype=torch.long),
            'neg_pop': torch.tensor(neg['popularity'], dtype=torch.float),
            'neg_dur': torch.tensor(neg['duration'], dtype=torch.float),
        }

# ============================================
# Training
# ============================================
def train_model(model, dataloader, epochs, lr):
    optimizer = optim.Adam(model.parameters(), lr=lr, weight_decay=1e-4)
    scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, epochs)

    model.train()
    history = []

    for epoch in range(epochs):
        total_loss = 0
        for batch in dataloader:
            # Positive scores
            pos_score = model(
                batch['pos_artist'].to(DEVICE),
                batch['pos_pop'].to(DEVICE),
                batch['pos_dur'].to(DEVICE)
            )
            # Negative scores
            neg_score = model(
                batch['neg_artist'].to(DEVICE),
                batch['neg_pop'].to(DEVICE),
                batch['neg_dur'].to(DEVICE)
            )

            # Margin Ranking Loss: positive should be higher than negative
            loss = F.margin_ranking_loss(
                pos_score, neg_score,
                torch.ones_like(pos_score),
                margin=MARGIN
            )

            # BCE Loss for score regularization
            bce_loss = F.binary_cross_entropy(pos_score, torch.ones_like(pos_score)) + \
                      F.binary_cross_entropy(neg_score, torch.zeros_like(neg_score))

            total_loss_batch = loss + 0.5 * bce_loss

            optimizer.zero_grad()
            total_loss_batch.backward()
            optimizer.step()

            total_loss += total_loss_batch.item()

        scheduler.step()
        avg_loss = total_loss / len(dataloader)
        history.append(avg_loss)

        if (epoch + 1) % 5 == 0 or epoch == 0:
            print(f"  Epoch [{epoch+1}/{epochs}] Loss: {avg_loss:.4f}")

    return history

# ============================================
# Recommendation
# ============================================
def generate_recommendations(model, ems_tracks, encoder, top_k=30):
    model.eval()
    results = []

    with torch.no_grad():
        for track in ems_tracks:
            feat = encoder.encode_track(track)
            artist_t = torch.tensor([feat['artist_idx']], dtype=torch.long).to(DEVICE)
            pop_t = torch.tensor([feat['popularity']], dtype=torch.float).to(DEVICE)
            dur_t = torch.tensor([feat['duration']], dtype=torch.float).to(DEVICE)

            score = model(artist_t, pop_t, dur_t).item()

            results.append({
                'track_id': track['track_id'],
                'title': track['title'],
                'artist': track['artist'],
                'album': track.get('album'),
                'popularity': track.get('popularity'),
                'artwork': track.get('artwork'),
                'dl_score': round(score * 100, 2)
            })

    results.sort(key=lambda x: x['dl_score'], reverse=True)
    return results[:top_k]

# ============================================
# Main
# ============================================
def main():
    USER_ID = 3
    print("=" * 60)
    print("[Hybrid DL] 하이브리드 딥러닝 추천 모델 학습")
    print("=" * 60)

    # 1. 데이터 로드
    print("\n[1] 데이터 로드")
    pos_tracks, ems_tracks, artists = load_data(USER_ID)
    print(f"   - 학습 트랙: {len(pos_tracks)}")
    print(f"   - EMS 트랙: {len(ems_tracks)}")
    print(f"   - 아티스트 수: {len(artists)}")

    # 선호 아티스트 분석
    artist_counts = defaultdict(int)
    for t in pos_tracks:
        artist_counts[t['artist']] += 1
    top_artists = sorted(artist_counts.items(), key=lambda x: x[1], reverse=True)[:10]
    print(f"\n   선호 아티스트 TOP 5:")
    for a, c in top_artists[:5]:
        print(f"     - {a}: {c}곡")

    # 2. Feature Encoder
    print("\n[2] Feature Encoding")
    encoder = FeatureEncoder(artists)

    # 3. Dataset
    print("\n[3] Dataset 생성")
    dataset = TripletDataset(pos_tracks, ems_tracks, encoder, neg_ratio=4)
    dataloader = DataLoader(dataset, batch_size=BATCH_SIZE, shuffle=True)
    print(f"   - 학습 샘플: {len(dataset)}")

    # 4. 모델
    print("\n[4] 모델 생성")
    model = HybridRecommender(
        num_artists=encoder.num_artists,
        artist_embed_dim=ARTIST_EMBEDDING_DIM,
        hidden_dim=HIDDEN_LAYERS[0]
    ).to(DEVICE)

    params = sum(p.numel() for p in model.parameters())
    print(f"   - 파라미터: {params:,}")

    # 5. 학습
    print(f"\n[5] 모델 학습 (Epochs: {EPOCHS})")
    history = train_model(model, dataloader, EPOCHS, LEARNING_RATE)

    # 6. 저장
    print("\n[6] 모델 저장")
    os.makedirs('models', exist_ok=True)
    torch.save({
        'model_state_dict': model.state_dict(),
        'artist_to_idx': encoder.artist_to_idx,
        'user_id': USER_ID,
        'history': history
    }, f'models/hybrid_user_{USER_ID}.pt')

    # 7. 추천
    print("\n[7] 추천 생성")
    recommendations = generate_recommendations(model, ems_tracks, encoder, top_k=30)

    # 저장
    with open(f'models/hybrid_recommendations_{USER_ID}.json', 'w', encoding='utf-8') as f:
        json.dump({
            'user_id': USER_ID,
            'model': 'Hybrid DL (Triplet + BCE)',
            'generated_at': datetime.now().isoformat(),
            'recommendations': recommendations
        }, f, ensure_ascii=False, indent=2)

    # 결과
    print("\n" + "=" * 60)
    print("[DONE] 학습 완료!")
    print("=" * 60)

    print(f"\n[Result] Final Loss: {history[-1]:.4f}")

    print(f"\n[Top 20 추천 트랙]")
    print("-" * 60)
    for i, r in enumerate(recommendations[:20], 1):
        print(f" {i:2d}. [{r['dl_score']:5.1f}] {r['title'][:28]}")
        print(f"     Artist: {r['artist'][:30]}")

    # EMS 아티스트 매칭 분석
    print(f"\n[선호 아티스트 매칭 분석]")
    top_artist_names = {a for a, _ in top_artists}
    matched = [r for r in recommendations if r['artist'] in top_artist_names]
    print(f"   - Top 30 중 선호 아티스트 트랙: {len(matched)}개")
    for m in matched[:5]:
        print(f"     - {m['title'][:25]} by {m['artist']}")

    return recommendations

if __name__ == "__main__":
    main()
