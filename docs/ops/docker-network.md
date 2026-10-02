# Docker ネットワーク設定

学内教室 Wi-Fi の帯域と Docker の内部ネットワークが衝突する問題と、その回避手順をまとめます。

## 症状

本番デプロイ後、次のような状態になります。

- 教室 Wi-Fi につないだ端末から `http://<サーバーIP>:4000` にアクセスできない
- サーバー自身から教室 Wi-Fi 上の端末や一部の学内ホストに到達できない
- `docker compose ps` 上はすべて `healthy` で、コンテナ内部からは相互に通信できている

## 原因

Docker Compose は、明示的な指定がなければプロジェクト用の bridge ネットワークに
`172.17.0.0/16` 以降の帯域を順番に自動割り当てします。

学内教室 Wi-Fi は **172.18.0.0/22** を使用しているため、Docker がこの帯域を掴むと
ホストのルーティングテーブル上で教室 Wi-Fi 宛のパケットが Docker ブリッジ側へ吸われ、
同じ帯域の端末と通信できなくなります。

実際に、設定を入れる前の本プロジェクトのネットワークは次の状態でした。

```console
$ docker network inspect fast-api-lms_react_default \
    --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}'
172.18.0.0/16
```

`172.18.0.0/16` は教室 Wi-Fi の `172.18.0.0/22` を完全に内包しているため、確実に衝突します。

## 対処

`docker-compose.prod.yml` で default ネットワークの帯域を固定しています。

```yaml
# 学内教室 Wi-Fi (172.18.0.0/22) との競合を避けるため、Docker 内部ネットワークの帯域を固定する
networks:
  default:
    driver: bridge
    ipam:
      config:
        - subnet: 10.200.0.0/24
          gateway: 10.200.0.1
```

`10.200.0.0/24` は RFC1918 のプライベート帯域で、学内で使われていない範囲を選んでいます。

## 適用手順

**既存のネットワークが残っているとサブネットの変更は反映されません。**
Docker はネットワーク作成時にしか IPAM 設定を読まないためです。
`scripts/deploy.sh` は `up --build -d` のみで `down` を行わないので、
初回適用時は手動で一度落としてください。

```bash
# 1. コンテナとネットワークを停止・削除する（-v は付けないこと。DB ボリュームが消えます）
docker compose -f docker-compose.yml -f docker-compose.prod.yml down

# 2. ネットワークが消えたことを確認する
docker network ls | grep fast-api-lms_react

# 3. 再デプロイ
./scripts/deploy.sh
```

もし手順 2 でネットワークが残っていたら、手動で削除します。

```bash
docker network rm fast-api-lms_react_default
```

## 確認

新しい帯域が適用されたことを確認します。

```console
$ docker network inspect fast-api-lms_react_default \
    --format '{{range .IPAM.Config}}subnet={{.Subnet}} gateway={{.Gateway}}{{end}}'
subnet=10.200.0.0/24 gateway=10.200.0.1
```

教室 Wi-Fi の端末からアクセスできることもあわせて確認してください。

```bash
# サーバー側で自分の IP を確認
hostname -I | awk '{print $1}'
```

## 10.200.0.0/24 も衝突する場合

デプロイ先のネットワーク環境によっては `10.200.0.0/24` も使えないことがあります。
その場合は `docker-compose.prod.yml` の `subnet` / `gateway` を、
周囲で使われていない RFC1918 の帯域に書き換えてください。

- 使用中の帯域は `ip route` および `docker network ls` + `docker network inspect` で確認できます
- `/24` は最大 254 アドレスです。本プロジェクトのコンテナ数では十分ですが、
  同一ホストで他のスタックも動かす場合は帯域を分けてください
- 書き換えたあとは、上の「適用手順」をもう一度実行します（`down` が必須）

## 補足: 開発環境について

`docker-compose.yml`（開発用）には `networks` の指定がなく、従来どおり Docker の自動割り当てのままです。
開発機で同じ衝突が起きる場合は、Docker Engine 全体の割り当て帯域を変更するのが確実です。

```json
// /etc/docker/daemon.json （Docker Desktop の場合は Settings > Docker Engine）
{
  "default-address-pools": [
    { "base": "10.201.0.0/16", "size": 24 }
  ]
}
```

変更後は Docker デーモンの再起動と、既存ネットワークの作り直しが必要です。
