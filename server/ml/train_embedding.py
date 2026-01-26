"""
Track Embedding 기반 음악 추천 시스템

접근법:
1. Track2Vec: 트랙을 벡터 공간에 임베딩
2. User Profile: 사용자가 좋아하는 트랙들의 평균 임베딩
3. Cosine Similarity: 사용자 프로필과 EMS 트랙 간 유사도 계산

실행: cd server/ml && python train_embedding.py
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
print(f"[Track2Vec] Device: {DEVICE}")

# 하이퍼파라미터
EMBEDDING_DIM = 64
ARTIST_DIM = 32
EPOCHS = 100
BATCH_SIZE = 512
LR = 0.01

# ============================================
# DB
# ============================================
def get_db():
    return mysql.connector.connect(
        host='localhost', port=3307,
        user='root', password='0000',
        database='music_space_db'
    )

def load_all_data(user_id):
    conn = get_db()
    cur = conn.cursor(dictionary=True)

    # 사용자 PMS 트랙
    cur.execute("""
        SELECT DISTINCT t.track_id, t.artist, t.popularity, t.duration
        FROM tracks t
        JOIN playlist_tracks pt ON t.track_id = pt.track_id
        JOIN playlists p ON pt.playlist_id = p.playlist_id
        WHERE p.user_id = %s AND p.space_type = 'PMS'
    """, (user_id,))
    user_tracks = cur.fetchall()

    # EMS 트랙
    cur.execute("""
        SELECT DISTINCT t.track_id, t.title, t.artist, t.album,
               t.popularity, t.duration, t.artwork
        FROM tracks t
        JOIN playlist_tracks pt ON t.track_id = pt.track_id
        JOIN playlists p ON pt.playlist_id = p.playlist_id
        WHERE p.space_type = 'EMS'
    """)
    ems_tracks = cur.fetchall()

    # 모든 아티스트
    cur.execute("SELECT DISTINCT artist FROM tracks WHERE artist IS NOT NULL")
    all_artists = [r['artist'] for r in cur.fetchall()]

    cur.close()
    conn.close()

    return user_tracks, ems_tracks, all_artists

# ============================================
# Track Embedding Model
# ============================================
class Track2Vec(nn.Module):
    """
    트랙을 벡터로 임베딩하는 모델

    입력 특성:
    - Artist (embedding)
    - Popularity (normalized)
    - Duration (normalized)

    출력: 64차원 트랙 벡터
    """

    def __init__(self, num_artists, artist_dim=32, output_dim=64):
        super().__init__()

        self.artist_embed = nn.Embedding(num_artists + 1, artist_dim, padding_idx=0)

        # Content encoder
        self.encoder = nn.Sequential(
            nn.Linear(artist_dim + 2, 64),
            nn.LeakyReLU(0.2),
            nn.Linear(64, output_dim),
            nn.Tanh()  # 출력을 -1~1로 제한
        )

        nn.init.xavier_uniform_(self.artist_embed.weight)

    def forward(self, artist_idx, popularity, duration):
        # Artist embedding
        artist_emb = self.artist_embed(artist_idx)

        # Concatenate features
        features = torch.cat([
            artist_emb,
            popularity.unsqueeze(-1),
            duration.unsqueeze(-1)
        ], dim=-1)

        # Encode to embedding
        return F.normalize(self.encoder(features), p=2, dim=-1)

# ============================================
# Triplet Dataset
# ============================================
class TripletDataset(Dataset):
    """
    Triplet Loss 학습용 데이터셋

    목표: 같은 사용자가 좋아하는 트랙들은 가깝게,
          다른 트랙들은 멀게 임베딩
    """

    def __init__(self, positive_tracks, negative_tracks, artist_to_idx):
        self.pos = positive_tracks
        self.neg = negative_tracks
        self.artist_map = artist_to_idx
        self.triplets = self._create_triplets()

    def _create_triplets(self):
        triplets = []
        for i, anchor in enumerate(self.pos):
            # 같은 아티스트의 다른 곡 = positive
            same_artist = [t for t in self.pos if t['artist'] == anchor['artist'] and t != anchor]
            if same_artist:
                positive = np.random.choice(same_artist)
            else:
                # 없으면 랜덤 positive
                others = [t for t in self.pos if t != anchor]
                positive = np.random.choice(others) if others else anchor

            # Negative
            negative = np.random.choice(self.neg)

            triplets.append((anchor, positive, negative))

        return triplets

    def _encode(self, track):
        artist_idx = self.artist_map.get(track['artist'], 0)
        pop = (track['popularity'] or 50) / 100.0
        dur = min((track['duration'] or 240) / 600.0, 1.0)
        return artist_idx, pop, dur

    def __len__(self):
        return len(self.triplets) * 5  # 증강

    def __getitem__(self, idx):
        anchor, pos, neg = self.triplets[idx % len(self.triplets)]

        # 랜덤 negative 재선택 (다양성)
        if np.random.random() > 0.5:
            neg = np.random.choice(self.neg)

        a_artist, a_pop, a_dur = self._encode(anchor)
        p_artist, p_pop, p_dur = self._encode(pos)
        n_artist, n_pop, n_dur = self._encode(neg)

        return {
            'a_artist': torch.tensor(a_artist, dtype=torch.long),
            'a_pop': torch.tensor(a_pop, dtype=torch.float),
            'a_dur': torch.tensor(a_dur, dtype=torch.float),
            'p_artist': torch.tensor(p_artist, dtype=torch.long),
            'p_pop': torch.tensor(p_pop, dtype=torch.float),
            'p_dur': torch.tensor(p_dur, dtype=torch.float),
            'n_artist': torch.tensor(n_artist, dtype=torch.long),
            'n_pop': torch.tensor(n_pop, dtype=torch.float),
            'n_dur': torch.tensor(n_dur, dtype=torch.float),
        }

# ============================================
# Training
# ============================================
def train_embedding_model(model, dataloader, epochs, lr):
    optimizer = optim.Adam(model.parameters(), lr=lr)
    scheduler = optim.lr_scheduler.StepLR(optimizer, step_size=30, gamma=0.5)
    triplet_loss = nn.TripletMarginLoss(margin=0.3)

    model.train()
    history = []

    for epoch in range(epochs):
        total_loss = 0
        for batch in dataloader:
            # Anchor
            anchor = model(
                batch['a_artist'].to(DEVICE),
                batch['a_pop'].to(DEVICE),
                batch['a_dur'].to(DEVICE)
            )
            # Positive
            positive = model(
                batch['p_artist'].to(DEVICE),
                batch['p_pop'].to(DEVICE),
                batch['p_dur'].to(DEVICE)
            )
            # Negative
            negative = model(
                batch['n_artist'].to(DEVICE),
                batch['n_pop'].to(DEVICE),
                batch['n_dur'].to(DEVICE)
            )

            loss = triplet_loss(anchor, positive, negative)

            optimizer.zero_grad()
            loss.backward()
            optimizer.step()

            total_loss += loss.item()

        scheduler.step()
        avg_loss = total_loss / len(dataloader)
        history.append(avg_loss)

        if (epoch + 1) % 20 == 0 or epoch == 0:
            print(f"  Epoch [{epoch+1}/{epochs}] Triplet Loss: {avg_loss:.4f}")

    return history

# ============================================
# Recommendation via Cosine Similarity
# ============================================
def get_recommendations(model, user_tracks, ems_tracks, artist_to_idx, top_k=30):
    model.eval()

    def encode_batch(tracks):
        artists = torch.tensor([artist_to_idx.get(t['artist'], 0) for t in tracks], dtype=torch.long).to(DEVICE)
        pops = torch.tensor([(t['popularity'] or 50) / 100.0 for t in tracks], dtype=torch.float).to(DEVICE)
        durs = torch.tensor([min((t['duration'] or 240) / 600.0, 1.0) for t in tracks], dtype=torch.float).to(DEVICE)
        with torch.no_grad():
            return model(artists, pops, durs)

    # 사용자 프로필: positive 트랙 임베딩의 평균
    user_embeddings = encode_batch(user_tracks)
    user_profile = user_embeddings.mean(dim=0, keepdim=True)  # (1, 64)

    # EMS 트랙 임베딩
    batch_size = 500
    all_scores = []

    for i in range(0, len(ems_tracks), batch_size):
        batch = ems_tracks[i:i+batch_size]
        embeddings = encode_batch(batch)

        # Cosine similarity
        similarities = F.cosine_similarity(user_profile, embeddings, dim=-1)
        all_scores.extend(similarities.cpu().numpy())

    # 결과 정리
    results = []
    for track, score in zip(ems_tracks, all_scores):
        results.append({
            'track_id': track['track_id'],
            'title': track['title'],
            'artist': track['artist'],
            'album': track.get('album'),
            'popularity': track.get('popularity'),
            'artwork': track.get('artwork'),
            'similarity': round(float(score) * 100, 2)  # 0-100 스케일
        })

    # 정렬
    results.sort(key=lambda x: x['similarity'], reverse=True)
    return results[:top_k]

# ============================================
# Main
# ============================================
def main():
    USER_ID = 3

    print("=" * 60)
    print("[Track2Vec] Embedding 기반 음악 추천 시스템")
    print("=" * 60)

    # 1. 데이터 로드
    print("\n[1] 데이터 로드")
    user_tracks, ems_tracks, all_artists = load_all_data(USER_ID)
    print(f"   - 사용자 트랙: {len(user_tracks)}")
    print(f"   - EMS 트랙: {len(ems_tracks)}")
    print(f"   - 아티스트 수: {len(all_artists)}")

    # 선호 아티스트
    artist_counts = defaultdict(int)
    for t in user_tracks:
        artist_counts[t['artist']] += 1
    top_artists = sorted(artist_counts.items(), key=lambda x: x[1], reverse=True)[:10]
    print(f"\n   [선호 아티스트 TOP 5]")
    for a, c in top_artists[:5]:
        print(f"     - {a}: {c}곡")

    # 아티스트 인덱싱
    artist_to_idx = {a: i+1 for i, a in enumerate(all_artists)}

    # 2. Negative 샘플 준비
    print("\n[2] Negative 샘플 준비")
    user_track_ids = {t['track_id'] for t in user_tracks}
    negative_tracks = [t for t in ems_tracks if t['track_id'] not in user_track_ids]
    print(f"   - Negative 트랙: {len(negative_tracks)}")

    # 3. Dataset
    print("\n[3] Triplet Dataset 생성")
    dataset = TripletDataset(user_tracks, negative_tracks, artist_to_idx)
    dataloader = DataLoader(dataset, batch_size=BATCH_SIZE, shuffle=True, drop_last=True)
    print(f"   - 학습 샘플: {len(dataset)}")

    # 4. 모델
    print("\n[4] Track2Vec 모델 생성")
    model = Track2Vec(
        num_artists=len(all_artists),
        artist_dim=ARTIST_DIM,
        output_dim=EMBEDDING_DIM
    ).to(DEVICE)
    params = sum(p.numel() for p in model.parameters())
    print(f"   - 파라미터: {params:,}")
    print(f"   - Embedding 차원: {EMBEDDING_DIM}")

    # 5. 학습
    print(f"\n[5] 학습 시작 (Epochs: {EPOCHS})")
    history = train_embedding_model(model, dataloader, EPOCHS, LR)

    # 6. 저장
    print("\n[6] 모델 저장")
    os.makedirs('models', exist_ok=True)
    torch.save({
        'model_state_dict': model.state_dict(),
        'artist_to_idx': artist_to_idx,
        'embedding_dim': EMBEDDING_DIM,
        'user_id': USER_ID,
        'history': history
    }, f'models/track2vec_user_{USER_ID}.pt')

    # 7. 추천
    print("\n[7] 추천 생성 (Cosine Similarity)")
    recommendations = get_recommendations(model, user_tracks, ems_tracks, artist_to_idx, top_k=50)

    # 저장
    with open(f'models/track2vec_recommendations_{USER_ID}.json', 'w', encoding='utf-8') as f:
        json.dump({
            'user_id': USER_ID,
            'model': 'Track2Vec + Cosine Similarity',
            'embedding_dim': EMBEDDING_DIM,
            'generated_at': datetime.now().isoformat(),
            'final_loss': history[-1],
            'recommendations': recommendations
        }, f, ensure_ascii=False, indent=2)

    # 결과
    print("\n" + "=" * 60)
    print("[DONE] 학습 완료!")
    print("=" * 60)

    print(f"\n[Result] Final Triplet Loss: {history[-1]:.4f}")

    # 점수 분포 확인
    scores = [r['similarity'] for r in recommendations]
    print(f"\n[Score Distribution]")
    print(f"   - Max: {max(scores):.1f}")
    print(f"   - Min: {min(scores):.1f}")
    print(f"   - Mean: {np.mean(scores):.1f}")
    print(f"   - Std: {np.std(scores):.1f}")

    print(f"\n[Top 25 추천 트랙] (Cosine Similarity)")
    print("-" * 60)
    for i, r in enumerate(recommendations[:25], 1):
        marker = "*" if r['artist'] in dict(top_artists) else " "
        print(f"{marker}{i:2d}. [{r['similarity']:5.1f}%] {r['title'][:28]}")
        print(f"     Artist: {r['artist'][:35]}")

    # 선호 아티스트 매칭
    top_artist_set = {a for a, _ in top_artists}
    matched = [r for r in recommendations if r['artist'] in top_artist_set]
    print(f"\n[선호 아티스트 매칭]")
    print(f"   - Top 50 추천 중 선호 아티스트 트랙: {len(matched)}개")
    if matched:
        print("   - 매칭된 트랙:")
        for m in matched[:10]:
            print(f"     [{m['similarity']:.1f}%] {m['title'][:25]} - {m['artist']}")

    return recommendations

if __name__ == "__main__":
    main()
