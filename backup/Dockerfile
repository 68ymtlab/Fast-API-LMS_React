# 定期バックアップ用コンテナ（pg_dump と、アップロードの tar だけをする小さなイメージ）。
# postgres の公式イメージ（db と同じ 16-alpine）に、スクリプトを 1 つ足すだけ。
# パッケージの追加（apk）をしないので、学内プロキシ越しのビルドでも失敗しにくい。
FROM postgres:16-alpine

COPY run.sh /usr/local/bin/lms-backup
RUN chmod 755 /usr/local/bin/lms-backup

# postgres イメージの ENTRYPOINT（docker-entrypoint.sh）は使わない
ENTRYPOINT ["/usr/local/bin/lms-backup"]
