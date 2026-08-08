# Firebase Emulator Suite（Firestore + Emulator UI）をローカル開発用に起動する。
# gcloud SDK 版の Firestore エミュレータには管理 UI が無いため、UI 付きの
# firebase-tools 版に差し替える。UI からコレクション/ドキュメントを閲覧・編集できる。
FROM node:20-bookworm-slim

# Firestore エミュレータの本体は Java 実装なので JRE が必要。
# firebase-tools は JDK 21+ を要求するため、Adoptium(Temurin) の apt から JRE 21 を入れる。
RUN apt-get update \
  && apt-get install -y --no-install-recommends wget apt-transport-https gnupg ca-certificates \
  && mkdir -p /etc/apt/keyrings \
  && wget -qO - https://packages.adoptium.net/artifactory/api/gpg/key/public | gpg --dearmor -o /etc/apt/keyrings/adoptium.gpg \
  && echo "deb [signed-by=/etc/apt/keyrings/adoptium.gpg] https://packages.adoptium.net/artifactory/deb bookworm main" > /etc/apt/sources.list.d/adoptium.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends temurin-21-jre \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g firebase-tools

# 初回起動時のダウンロード待ちを避けるため、エミュレータ本体と UI を
# ビルド時に取得してイメージへキャッシュしておく。
RUN firebase setup:emulators:firestore \
  && firebase setup:emulators:ui

WORKDIR /app

# 8085: Firestore / 4000: Emulator UI / 4400: Emulator Hub（UI が使う）
EXPOSE 8085 4000 4400

# --project demo: 実 GCP 認証なしのオフライン起動。firebase.json は volume でマウントする。
CMD ["firebase", "emulators:start", "--only", "firestore", "--project", "demo"]
