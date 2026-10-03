# Docker ネットワーク変更手順（本番）

## 背景

23号館・8号館の教室 Wi-Fi は `172.18.0.0/22` を使用している。  
Docker が同じ帯域の内部ネットワークを自動作成すると、サーバーが返信先を誤り、教室から kit-ai にアクセスできなくなる。

`docker-compose.prod.yml` で Docker の内部ネットワークを `10.200.0.0/24` に固定し、競合を回避する。

## データについて

以下の手順では **DB データ・アップロードファイルは消えない**（ボリュームはそのまま残る）。

| 操作 | データ |
|---|---|
| `down` → 再デプロイ | 残る |
| `down -v` | 消える |
| `./scripts/reset.sh` | 消える |

**`-v` オプションと `reset.sh` は使わないこと。**

## 手順

kit-ai サーバーに SSH 接続し、プロジェクトディレクトリで実行する。

### 1. 最新コードを取得

```bash
git pull
```

`docker-compose.prod.yml` に `networks` 設定が入っていることを確認する。

### 2.（任意）変更前の状態を確認

```bash
ip route | grep 172.18
docker network ls
docker network inspect fast-api-lms_react_default 2>/dev/null | grep Subnet
```

`172.18` 帯のルートやサブネットが見えていれば、競合の原因になっている可能性が高い。

### 3. コンテナを停止（ボリュームは残す）

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml down
```

`-v` は付けない。

### 4. 古い Docker ネットワークを削除

```bash
docker network prune
```

確認プロンプトが出たら `y` で OK。  
このプロジェクト専用の未使用ネットワークが削除される。

### 5. 再デプロイ

```bash
./scripts/deploy.sh
```

または:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d
```

### 6. 反映確認

```bash
# 新しいサブネットが 10.200.0.0/24 になっているか
docker network inspect fast-api-lms_react_default | grep Subnet

# コンテナが正常起動しているか
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
```

ブラウザで `http://<サーバーIP>:4000` にアクセスし、動作を確認する。

### 7. 教室 Wi-Fi からの接続確認

23号館または8号館の教室 Wi-Fi から kit-ai にアクセスできるか確認する。  
問題が解消していれば、情報処理サービスセンターへ完了報告する。

## うまくいかない場合

### 502 Bad Gateway が出る

nginx ログに `frontend could not be resolved` と出ている場合、**一部のコンテナだけ再作成した**ことが原因のことが多い。  
ネットワーク変更後に `deploy.sh` だけ実行すると、古い frontend コンテナに `frontend` という DNS 名が付かないまま残る。

**対処（データは消えない）:**

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --force-recreate
```

または手順 3 の `down` からやり直す。

### ネットワーク帯域が変わらない

- まだ `172.18` 帯のネットワークが残っている可能性がある。手順 3〜5 を再度実行する。
- 同じサーバー上に別の Docker プロジェクトがある場合、サーバー管理者と相談し `/etc/docker/daemon.json` で `default-address-pools` を変更する方法も検討する。

```json
{
  "default-address-pools": [
    {
      "base": "10.200.0.0/16",
      "size": 24
    }
  ]
}
```

変更後は `sudo systemctl restart docker` が必要。他の Docker 利用にも影響するため、実施前に確認すること。
