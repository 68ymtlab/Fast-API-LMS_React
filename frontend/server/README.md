# fast-api-lms

## fast-api-lmsの概要・基本機能
# FastAPI-LMS-Sampleの概要

FastAPI-LMSには現在、クイズを受けたり、教科書コンテンツを閲覧する機能や、教師アカウントでログインした時は、学習コースの管理を行う機能が実装されています。

## ログイン画面

アプリを起動した後、以下のリンクを踏むとログインページに移ります。

http://localhost:8080/Login
<img width="941" alt="スクリーンショット 2022-05-19 15 52 37" src="https://user-images.githubusercontent.com/47232971/169228980-ec3acf9d-6ca9-4d4e-b042-2b8845c15fd8.png">

上の画像で表示しているアカウント(neo@neo.com)は学生用アカウントで、教科書コンテンツの閲覧と、クイズページの閲覧・回答、学習コース選択が可能です。

一方で、下の画像に表示されている教師アカウント(yanagi@yanagi)でログインすると、教師用のページに遷移し、学習コースの追加・期限編集などの管理が行えます。
<img width="843" alt="スクリーンショット 2022-05-19 16 21 31" src="https://user-images.githubusercontent.com/47232971/169235398-a0ac0df0-00c2-455c-94d0-58ee030dd186.png">

## ログアウト

ログアウトは、画面右上にあるところLOGOUTの文字をクリックするとできます。
<img width="1015" alt="スクリーンショット 2022-05-24 9 23 49" src="https://user-images.githubusercontent.com/47232971/169924603-0be427e1-f544-48ee-8713-404a218031c0.png">


## 学習コース選択・追加（教師専用）

<img width="968" alt="スクリーンショット 2022-05-19 16 12 15" src="https://user-images.githubusercontent.com/47232971/169232367-6c87a3da-f481-4d6c-b9df-f080b80dd694.png">

## 新しいコースの追加
このページにsample_week1という名前のフォルダをアップロードすることでサンプルの学習コース（sample_courseでない方）が出来上がります。

基本的なコンテンツが掲載されたプロトタイプはこの新しく追加した方の学習コースで確認できます。

<img width="947" alt="スクリーンショット 2022-05-19 16 13 51" src="https://user-images.githubusercontent.com/47232971/169232525-5449363a-fd98-47c9-a5af-c0a42195dd7b.png">

## コースの管理

現在、コース管理ページからは、履修者の追加、コースの期限の設定、学習コース名の変更が行えます
<img width="947" alt="スクリーンショット 2022-05-19 16 18 15" src="https://user-images.githubusercontent.com/47232971/169234184-d97a4fce-78f7-44ab-af13-1913143d4acf.png">
<img width="954" alt="スクリーンショット 2022-05-19 16 18 21" src="https://user-images.githubusercontent.com/47232971/169234751-d6ffd2a2-8908-447d-be5e-f931cd8398e0.png">


## 学習コース選択画面

学生用アカウントでログインすると、以下のような学習コース選択画面に遷移します。
<img width="936" alt="スクリーンショット 2022-05-19 15 56 27" src="https://user-images.githubusercontent.com/47232971/169229636-f6f69392-8ba0-42ff-a41b-8f1c1a236e6d.png">

ここで提示されている学習コースをクリックすると学習コースのページに遷移します。

## 画面（教科書コンテンツ）

学習コース（１週目）に遷移すると、教科書のページが表示されます。
<img width="970" alt="スクリーンショット 2022-05-19 15 58 25" src="https://user-images.githubusercontent.com/47232971/169230050-2c77d23d-b4c3-4918-b481-a9b788b95a45.png">

このページを下の方にスクロールしていくと、「問題はこちら」と書かれたリンクがあり、そこをクリックすることで演習問題のフローページに遷移することができます。
<img width="987" alt="スクリーンショット 2022-05-19 16 00 12" src="https://user-images.githubusercontent.com/47232971/169230300-16c784a4-5b00-469a-ab73-0846f6457154.png">

## 演習問題のフローページ

演習問題のフローページからは、StartNewFlowSessionボタン、もしくはすでに受けてあるテストログのStartボタンから演習問題のページに遷移することができます。

<img width="1000" alt="スクリーンショット 2022-05-19 16 02 33" src="https://user-images.githubusercontent.com/47232971/169230685-b1f1e64d-14c0-4b99-abfb-f982b83a99ea.png">

GoToCourseボタンからは、またコースページに戻ることができます。

## 演習問題のページ

演習問題のページでは実際にクイズを受けることができます。クイズに回答すると、正誤判定が表示され、終了ボタンを押すと、クイズを終了し、クイズの開始時刻と終了時刻が記録されます。
<img width="949" alt="スクリーンショット 2022-05-19 16 05 37" src="https://user-images.githubusercontent.com/47232971/169231226-7a08b656-4999-4592-8290-0461368e81df.png">



# fast-api-lmsのインストール方法
## 環境の作成
#### リポジトリのクローン
ローカル環境ににリポジトリをクローンします.  

    git clone https://github.com/68ymtlab/fast-api-lms.git


#### Docker Desktopのインストール
以下のリンクから`Docker Desktop` インストーラをインストールします.  

https://docs.docker.com/desktop/windows/release-notes/    

*※ バージョン`4.5`にて, WSL2が使用できない不具合を確認しています. それ以降のバージョンか, 動作確認済みの`4.3.2`を使用してください.*  


インストーラを起動し, 画面の指示に従ってインストールをしてください. 
インストールが終了したら, コマンドプロンプトを開き,

    docker-compose --version
    
を実行し, バージョンが表示されたらインストールは完了です.  

***出力例***

    docker-compose version 1.29.2, build 5becea4c


#### docker 環境のビルド
以下のコマンドを実行し, `clone`したディレクトリに移動します.

    cd クローンした場所/FastAPI-LMS-Sample

続いて, docker環境をビルドします.  

    docker-compose build

#### 必要ライブラリのインストール
バックエンドで使用するFastAPI関連のライブラリをインストールします.   
以下のコマンドを実行します.

    docker-compose run --entrypoint "poetry install" backend
    
#### コンテナを立ち上げる. 
`Docker Desktop` 上の `Container → fast-api-lms → fast-api-lms_frontend_1 → Start` をクリックします.  

![image](https://user-images.githubusercontent.com/29095003/155274753-02d0ef78-a1ff-43aa-9184-42c75b8ff9c7.png)
    
#### データベースのマイグレーションを実行する
データベース上でテーブルの作成と, 初期データのインサートを行います.  
以下のコマンドを実行します. 

    docker-compose exec backend poetry run python -m api.migrate_db
  
#### フロントエンドのプロジェクト作成
フロントエンドとして使用する`Vue.js`のプロジェクトを作成します. 
`Docker Desktop` 上の `Container → fast-api-lms → fast-api-lms_frontend_1 → CLI` をクリックします.   

![image](https://user-images.githubusercontent.com/29095003/155274124-b12c7ec3-31b9-4e8c-9e8d-41f0f165ac7c.png)

新たに端末が立ち上がるので,

    cd my-application
    
でカレントディレクトリを変更し,  

    npm install
    
で必要なライブラリをインストールします.   
この状態, または次のコマンドでエラーが出る場合は, `npm audit fix`を実行してください. 

追加で、以下のコマンドを実行してください.

    npm install --save marked

次に, 作成したプロジェクトを起動します. 以下のコマンドを実行します. 

    npm run serve
    
## 作成した環境の確認
#### FastAPIバックエンドの確認
ブラウザ上で http://localhost:8000/docs を開きます.  
下の様なページが表示されます.   

![image](https://user-images.githubusercontent.com/29095003/155275231-baab5717-d327-4657-925e-c23b175606fb.png)

#### Vue.jsフロントエンドの確認
ブラウザ上で http://localhost:8080/Login を開きます. 
ログインフォームが表示されます. 

#### データベースの確認
`Docker Desktop` 上の `Container → fast-api-lms → fast-api-lms_db_1 → CLI` をクリックします.   
新しく端末が立ち上がるので, 端末上で

    mysql
    use demo;
    show tables;
    
を実行し, テーブルの一覧が表示されることを確認します. 

# fastapi-lms-sampleの起動方法
## 2回目以降の環境の起動方法
`Docker Desktop` 上の `Container → fast-api-lms→ Start`をクリックします.   
コンテナが立ち上がるので, `Container → fast-api-lms → fast-api-lms_db_1 → CLI` を実行し, 開いた端末上で

    mysql
    use demo;
    
を実行します. 
 `Container → fastapi-lms-sample → fast-api-lms_frontend_1 → CLI` を実行し, 開いた端末上で
 
    cd my-application
    npm run serve
    
を実行します. 
http://localhost:8000/docs  
http://localhost:8080/Login
を開いて, 起動完了です. 

Docker Desktopでログが更新されなくなったときは、

 　　　　　　cd クローンしたディレクトリ/fast-api-lms

 　　　　　　docker-compose logs -f

でログが見れます。

