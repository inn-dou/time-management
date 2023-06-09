const express = require('express'); 
const mysql = require('mysql2');
const app = express();
const session = require('express-session');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const path = require('path');
// .envから環境変数取り込み
require('dotenv').config();

const pool = mysql.createPool({
    connectionLimit: 10,
    host: process.env.DB_HOSTNAME,
    port: process.env.DB_PORT,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: {
      rejectUnauthorized: false
    }
});

const pgPool = new Pool({
    connectionString: process.env.DB_URL,
    ssl: {
      rejectUnauthorized: false
    }
});


app.use(express.static('public'));
app.use(express.urlencoded({extended: false}));
app.use(
    session({
      secret: 'bnaafgnib42',
      resave: false,
      saveUninitialized: true,
    })
  );
  

app.use((req,res,next)=>{
    if(req.session.userId===undefined){
        console.log('ログインしていません');
        res.locals.userName='ゲスト';
        res.locals.isLoggedIn = false;
        res.locals.manager = false;
        res.locals.id = '';
    }else{
        console.log('ログインしています');
        res.locals.userName=req.session.userName;
        res.locals.isLoggedIn = true;
        res.locals.manager = req.session.manager;
        res.locals.id = req.session.userId;
        res.locals.flag = req.session.flag;
        res.locals.point = req.session.point;
    }
    if(req.session.errors===undefined){
        res.locals.error = '';
    }else{
        res.locals.error = req.session.errors;
    }

    
    next();
});

app.get('/', (req, res) => {
  res.render('login.ejs');
});

app.get('/top-manager',(req,res)=>{
    res.render('top-manager.ejs');
});

app.get('/top',(req,res)=>{
    res.render('top.ejs');
});

app.get('/user-list',(req,res)=>{
    pool.getConnection((err, connection) => {
        if (err) {
            console.error('Error connecting to MySQL database: ', err);
            return;
        }
        connection.query(
            'SELECT * FROM users',
            (error,results)=>{
                if (error) {
                    console.error('Error executing MySQL query: ', error);
                    connection.release(); // コネクションプールを返却
                    return;
                }
                res.render('user-list.ejs', {users:results});
                connection.release(); // コネクションプールを返却
            }
        );
    });
});

app.get('/schedule',(req,res)=>{
    res.render('schedule.ejs');
});

//ユーザー詳細画面
app.get('/user/:id' , (req,res)=>{
    var id = req.params.id;
    //contronller.getUser(id);
    pool.getConnection((err, connection) => {
        if (err) {
            console.error('Error connecting to MySQL database: ', err);
            return;
        }
        connection.query(
            'SELECT * FROM users WHERE id=?',
            [id],
            (error,userResults)=>{
                connection.query(
                    'SELECT * FROM work_history WHERE user_id=? ORDER BY history_id DESC',
                    [id],
                    (error,workHistoryResults)=>{
                        if (error) {
                            console.error('Error executing MySQL query: ', error);
                            connection.release(); // コネクションプールを返却
                            return;
                        }
                        console.log(userResults);
                        console.log(workHistoryResults);
                        res.render('user.ejs',{users:userResults[0],workHistory: workHistoryResults});
                        connection.release(); // コネクションプールを返却
                    }
                );
            }
        );
    });
});

//ユーザー情報編集画面
app.get('/user-info-edit/:id' , (req,res)=>{
    pool.getConnection((err, connection) => {
        if (err) {
            console.error('Error connecting to MySQL database: ', err);
            return;
        }
        connection.query(
            'SELECT * FROM users WHERE id=?',
            [req.params.id],
            (error,results)=>{
                if (error) {
                    console.error('Error executing MySQL query: ', error);
                    connection.release(); // コネクションプールを返却
                    return;
                }
                console.log(results[0]);
                res.render('user-info-edit.ejs',{users:results[0]});
                connection.release(); // コネクションプールを返却
            }
        );
    });
});

//ユーザー情報更新画面
app.post('/user-info-update/:id',(req,res)=>{
    pool.getConnection((err, connection) => {
        if (err) {
            console.error('Error connecting to MySQL database: ', err);
            return;
        }
        connection.query(
            'UPDATE users SET name=?, email=?, unit_price=?, point=? WHERE id=?',
            [req.body.username,req.body.email,req.body.unit_price,req.body.point,req.params.id],
            (error,results)=>{
                if (error) {
                    console.error('Error executing MySQL query: ', error);
                    connection.release(); // コネクションプールを返却
                    return;
                }
                console.log(results);
                let url = '/user/' + req.params.id;
                res.redirect(url);
                connection.release(); // コネクションプールを返却
            }
        );
    });
});

//勤怠履歴編集画面
app.get('/work_edit/:id',(req,res)=>{
    pool.getConnection((err, connection) => {
        if (err) {
            console.error('Error connecting to MySQL database: ', err);
            return;
        }
        connection.query(
            'SELECT * FROM work_history WHERE history_id=?',
            [req.params.id],
            (error,results)=>{
                if (error) {
                    console.error('Error executing MySQL query: ', error);
                    connection.release(); // コネクションプールを返却
                    return;
                }
                console.log(results[0]);
                res.render('work-edit.ejs',{workHistory:results[0]});
                connection.release(); // コネクションプールを返却
            }
        );
    });
});

//編集履歴更新画面
app.post('/work-update/:history_id',(req,res)=>{
    pool.getConnection((err, connection) => {
        if (err) {
            console.error('Error connecting to MySQL database: ', err);
            return;
        }
        connection.query(
            'UPDATE work_history SET In_time=?, Out_time=? WHERE history_id=?',
            [req.body.inTime,req.body.outTime,req.params.history_id],
            (error,results)=>{
                
                console.log('最初のアップデート完了');
                connection.query(
                    'SELECT * FROM work_history WHERE history_id=?',
                    [req.params.history_id],
                    (error,results)=>{
                        const userId = results[0].user_id;
                        const inTime = results[0].In_time;
                        const outTime = results[0].Out_time;
                        const oldPoint = results[0].point;
                        function calculateNighttimeHours(inTime, outTime) {
                            const nighttimeStartHour = 22;
                            const nighttimeEndHour = 5;
                            //時間定義
                            const inHour = inTime.getHours();
                            const outHour = outTime.getHours();
                            
                            console.log(inHour);
                            console.log(outHour);
                        
                            let nighttimeHours = 0;
                            let daytimeHours = 0;
                        
                            if (outHour >= inHour) {
                                // night to night and morning to morning
                                if (inHour >= nighttimeStartHour && outHour >= nighttimeStartHour || inHour <= nighttimeEndHour && outHour <= nighttimeEndHour) {
                                    nighttimeHours = outHour - inHour;
                                    daytimeHours = 0;
                                    console.log('朝のみ 夜のみ');
                                }
                                // morning to daytime
                                else if (inHour <= nighttimeEndHour && outHour > nighttimeEndHour && outHour <= nighttimeStartHour) {
                                    nighttimeHours = nighttimeEndHour - inHour;
                                    daytimeHours = outHour - inHour - nighttimeHours;
                                    console.log('出勤が夜間(朝)、退勤が昼間の場合');
                                }
                                // daytime to night
                                else if (outHour > nighttimeEndHour && outHour >= nighttimeStartHour && inHour > nighttimeEndHour && inHour <= nighttimeStartHour) {
                                    nighttimeHours = outHour - 22;
                                    daytimeHours = outHour - inHour - nighttimeHours;
                                    console.log('出勤が昼間、退勤が夜間(夜)の場合');
                                }
                                // morning to night
                                else if(inHour < nighttimeEndHour && outHour >= nighttimeStartHour){
                                    nighttimeHours = nighttimeEndHour - inHour + outHour - nighttimeStartHour;
                                    daytimeHours = outHour - inHour - nighttimeHours;
                                    console.log('出勤が早朝、退勤が夜間(夜)の場合');
                                }
                                // daytime to daytime
                                else {
                                    nighttimeHours = 0;
                                    daytimeHours = outHour - inHour;
                                    console.log('出退勤が昼間');
                                }
                            }
                            // Out_time<In_time
                            else {
                                // daytime to next tomorrow
                                if (inHour <= nighttimeStartHour && inHour >= nighttimeEndHour && outHour < nighttimeEndHour) {
                                    nighttimeHours = outHour + 24 - 22;
                                    daytimeHours = 24 - inHour - 2;
                                    console.log('昼間から翌日の早朝');
                                }
                                //daytime to next daytime
                                else if(inHour <= nighttimeStartHour && inHour >= nighttimeEndHour && outHour <= nighttimeStartHour && outHour >= nighttimeEndHour){
                                    nighttimeHours = 8;
                                    daytimeHours = 24 + outHour - inHour - 8;
                                    console.log('昼間から翌日の昼間');
                                }
                                //night to next morning
                                else if(inHour > nighttimeStartHour && inHour <= 24 &&  outHour <= nighttimeEndHour && outHour > 0){
                                    nighttimeHours = outHour + 24 - inHour;
                                    daytimeHours = 0;
                                    console.log('夜間から早朝');
                                }
                                //night to daytime
                                else if(inHour > nighttimeStartHour && inHour <= 24 && outHour <= nighttimeStartHour && outHour >= nighttimeEndHour){
                                    nighttimeHours = 24 - inHour + nighttimeEndHour;
                                    daytimeHours = outHour - nighttimeEndHour;
                                    console.log('夜間から昼間');
                                }
                                //night to tommorrow night
                                else if(inHour > nighttimeStartHour && inHour <= 24 && outHour > nighttimeStartHour && outHour <= 24){
                                    nighttimeHours = 24 - inHour + nighttimeEndHour + outHour- nighttimeStartHour;
                                    daytimeHours = 17;
                                    console.log('夜間から翌日夜間');
                                }
                                
                            }
                        
                            return [nighttimeHours, daytimeHours];
                        }
                        
                        const timeArray = calculateNighttimeHours(inTime, outTime);
                        
                        console.log('夜間時間（時）:', timeArray[0]);
                        console.log('勤労時間（時）:', timeArray[1]);

                        connection.query(
                            'SELECT * FROM users WHERE id=?',
                            [userId],
                            (error,userResults)=>{
                                //Point function
                                
                                //本日のポイント
                                const today_point = timeArray[0]+timeArray[1];
                                //変更によるポイントの差分を総ポイント数に反映
                                const sum_point = userResults[0].point + today_point - oldPoint;
                                //現在の追加されている時給　十円単位
                                const point = Math.floor(sum_point/1000) * 10;
                                //追加時給＋元々の時給
                                const unit_price = point + userResults[0].unit_price;
                                const sales = (unit_price * timeArray[1]) + ((unit_price * 1.25) * timeArray[0]);
                                connection.query(
                                    'UPDATE work_history SET sales=?, daytime=?, night=?, point=? WHERE history_id=?',
                                    [sales,timeArray[1],timeArray[0],today_point,req.params.history_id],
                                    (error,results)=>{
                                        connection.query(
                                            'UPDATE users SET point=? WHERE id=?',
                                            [sum_point ,userId],
                                            (error,results)=>{
                                                console.log(error);
                                                res.redirect(`/user/${userId}`);
                                                connection.release(); // プールを返却
                                            }
                                        );
                                    }
                                );
                            }
                        );
                    }
                    
                );

            }
        );
    });
});

//出勤ポスト
app.post('/In_time/:id',(req,res)=>{
    //toLocaleString()を使用する代わりに、MySQLが受け入れる形式で日付と時刻をフォーマットする必要があるため　let In_time = new Date().toLocaleString();
    let currentDate = new Date();
    let In_time = currentDate.toISOString().slice(0, 19).replace('T', ' ');
    console.log(In_time);
    pool.getConnection((err, connection) => {
        if (err) {
          console.error('Error connecting to MySQL database: ', err);
          return;
        }
        connection.query(
            'INSERT into work_history (user_id,In_time) VALUES(?,?)',
            [req.params.id,In_time],
            (error,results)=>{
                connection.query(
                    'UPDATE users SET work_flag=? WHERE id=?',
                    ['1',req.params.id],
                    (error,results)=>{
                        if (error) {
                            console.error('Error executing MySQL query: ', error);
                            connection.release(); // コネクションプールを返却
                            return;
                        }
                        console.log(results);
                        req.session.flag = '1';
                        res.redirect('/top');
                        connection.release(); // コネクションプールを返却
                    }
                );
            }

        );
    });
});

//退勤ポスト
app.post('/Out_time/:id',(req,res)=>{
    //let Out_time = new Date().toLocaleString();
    let currentDate = new Date();
    let Out_time = currentDate.toISOString().slice(0, 19).replace('T', ' ');
    pool.getConnection((err, connection) => {
        if (err) {
          console.error('Error connecting to MySQL database: ', err);
          return;
        }
        connection.query(
            'UPDATE work_history SET Out_time=? WHERE user_id=? ORDER BY history_id DESC LIMIT 1',
            [Out_time,req.params.id],
            (error,results)=>{
                connection.query(
                    'SELECT * FROM work_history WHERE user_id=? ORDER BY history_id DESC LIMIT 1',
                    [req.params.id],
                    (error,results)=>{
                        const inTime = results[0].In_time;
                        const outTime = results[0].Out_time;
                        console.log(inTime.getHours);
                        function calculateNighttimeHours(inTime, outTime) {
                            const nighttimeStartHour = 22;
                            const nighttimeEndHour = 5;
                            //時間定義
                            const inHour = inTime.getHours();
                            const outHour = outTime.getHours();
                            
                            console.log(inHour);
                            console.log(outHour);
                        
                            let nighttimeHours = 0;
                            let daytimeHours = 0;
                        
                            if (outHour >= inHour) {
                                // night to night and morning to morning
                                if (inHour >= nighttimeStartHour && outHour >= nighttimeStartHour || inHour <= nighttimeEndHour && outHour <= nighttimeEndHour) {
                                    nighttimeHours = outHour - inHour;
                                    daytimeHours = 0;
                                    console.log('朝のみ 夜のみ');
                                }
                                // morning to daytime
                                else if (inHour <= nighttimeEndHour && outHour > nighttimeEndHour && outHour <= nighttimeStartHour) {
                                    nighttimeHours = nighttimeEndHour - inHour;
                                    daytimeHours = outHour - inHour - nighttimeHours;
                                    console.log('出勤が夜間(朝)、退勤が昼間の場合');
                                }
                                // daytime to night
                                else if (outHour > nighttimeEndHour && outHour >= nighttimeStartHour && inHour > nighttimeEndHour && inHour <= nighttimeStartHour) {
                                    nighttimeHours = outHour - 22;
                                    daytimeHours = outHour - inHour - nighttimeHours;
                                    console.log('出勤が昼間、退勤が夜間(夜)の場合');
                                }
                                // morning to night
                                else if(inHour < nighttimeEndHour && outHour >= nighttimeStartHour){
                                    nighttimeHours = nighttimeEndHour - inHour + outHour - nighttimeStartHour;
                                    daytimeHours = outHour - inHour - nighttimeHours;
                                    console.log('出勤が早朝、退勤が夜間(夜)の場合');
                                }
                                // daytime to daytime
                                else {
                                    nighttimeHours = 0;
                                    daytimeHours = outHour - inHour;
                                    console.log('出退勤が昼間');
                                }
                            }
                            // Out_time<In_time
                            else {
                                // daytime to next tomorrow
                                if (inHour <= nighttimeStartHour && inHour >= nighttimeEndHour && outHour < nighttimeEndHour) {
                                    nighttimeHours = outHour + 24 - 22;
                                    daytimeHours = 24 - inHour - 2;
                                    console.log('昼間から翌日の早朝');
                                }
                                //daytime to next daytime
                                else if(inHour <= nighttimeStartHour && inHour >= nighttimeEndHour && outHour <= nighttimeStartHour && outHour >= nighttimeEndHour){
                                    nighttimeHours = 8;
                                    daytimeHours = 24 + outHour - inHour - 8;
                                    console.log('昼間から翌日の昼間');
                                }
                                //night to next morning
                                else if(inHour > nighttimeStartHour && inHour <= 24 &&  outHour <= nighttimeEndHour && outHour > 0){
                                    nighttimeHours = outHour + 24 - inHour;
                                    daytimeHours = 0;
                                    console.log('夜間から早朝');
                                }
                                //night to daytime
                                else if(inHour > nighttimeStartHour && inHour <= 24 && outHour <= nighttimeStartHour && outHour >= nighttimeEndHour){
                                    nighttimeHours = 24 - inHour + nighttimeEndHour;
                                    daytimeHours = outHour - nighttimeEndHour;
                                    console.log('夜間から昼間');
                                }
                                //night to tommorrow night
                                else if(inHour > nighttimeStartHour && inHour <= 24 && outHour > nighttimeStartHour && outHour <= 24){
                                    nighttimeHours = 24 - inHour + nighttimeEndHour + outHour- nighttimeStartHour;
                                    daytimeHours = 17;
                                    console.log('夜間から翌日夜間');
                                }
                                
                            }
                        
                            return [nighttimeHours, daytimeHours];
                        }
                        
                        const timeArray = calculateNighttimeHours(inTime, outTime);
                        
                        console.log('夜間時間（時）:', timeArray[0]);
                        console.log('勤労時間（時）:', timeArray[1]);

                        connection.query(
                            'SELECT * FROM users WHERE id=?',
                            [req.params.id],
                            (error,results)=>{
                                //Point function
                                const point = Math.floor(results[0].point/1000) * 10;
                                const unit_price = point + results[0].unit_price;
                                const today_point = timeArray[0]+timeArray[1];
                                //もし本日追加されたポイントによる時給アップは次回以降有効
                                const sum_point = results[0].point + today_point;
                                const sales = (unit_price * timeArray[1]) + ((unit_price * 1.25) * timeArray[0]);
                                connection.query(
                                    'UPDATE work_history SET sales=?, daytime=?, night=?, point=? WHERE user_id=? ORDER BY history_id DESC LIMIT 1',
                                    [sales,timeArray[1],timeArray[0],today_point,req.params.id],
                                    (error,results)=>{
                                        connection.query(
                                            'UPDATE users SET work_flag=?, point=? WHERE id=?',
                                            ['0' , sum_point ,req.params.id],
                                            (error,results)=>{
                                                console.log(error);
                                                req.session.flag = '0';
                                                res.redirect('/top');
                                                connection.release(); // コネクションプールを返却
                                            }
                                        );
                                    }
                                );
                            }
                        );
                    }
                    
                );

            }
        );
    });
});


app.get('/login' , (req,res)=>{
    res.render('login.ejs');
});


//ログイン処理
app.post('/login' , (req,res)=>{
    const email = req.body.email;
    pool.getConnection((err, connection) => {
        if (err) {
          console.error('Error connecting to MySQL database: ', err);
          return;
        }
        connection.query(
            'SELECT * FROM users WHERE email=?',
            [email],
            (error,results)=>{
                console.log(error);
                console.log(results);
                    if(results.length>0){
                        const plain = req.body.password;
                        const hash = results[0].password;
                        bcrypt.compare(plain,hash,(error,isEqual)=>{
                            if(isEqual){
                                console.log(results[0].id);
                                console.log(results[0].name);
                                req.session.userId = results[0].id;
                                req.session.userName = results[0].name;
                                req.session.manager = results[0].manager;
                                req.session.flag = results[0].work_flag;
                                req.session.point = results[0].point;
                                //Separete redirect depend on manager
                                if(results[0].manager){
                                    res.redirect('/top-manager');
                                    connection.release(); // コネクションプールを返却
                                }else{
                                    res.redirect('/top');
                                    connection.release(); // コネクションプールを返却
                                }
                            }else{
                                res.redirect('/login');
                                connection.release(); // コネクションプールを返却
                            }
                        });
                    }else{
                        res.redirect('/login');
                        connection.release(); // コネクションプールを返却
                    }
            }
        );
    });
});

app.get('/logout' , (req,res)=>{
    req.session.destroy((error)=>{
        res.redirect('/login');
    });
});

app.get('/signup-manager' , (req,res)=>{
    res.render('login.ejs');
});

app.get('/signup' , (req,res)=>{
    res.render('signup.ejs', {errors:[]});
});

//従業員登録確認画面
app.get('/signup-confirm' , (req,res)=>{
    res.locals.createUserName=req.session.createUserName;
    res.locals.createUserEmail=req.session.createUserEmail;
    res.render('signup-confirm.ejs');
});

//従業員新規登録
app.post('/signup' , 
    (req,res,next)=>{
        const username = req.body.username;
        const email = req.body.email;
        const password = req.body.password;
        const errors = [];
        if(username === ''){
            errors.push('ユーザー名が空です');
        }
        if(email === ''){
            errors.push('Emailが空です');
        }
        if(password === ''){
            errors.push('パスワードが空です');
        }
        console.log(errors);
        if(errors.length>0){
            res.render('signup.ejs',{errors:errors});
        }else{
            next();
        }
    },
    (req,res,next)=>{
        console.log('メール重複チェック');
        const email = req.body.email;
        const errors = [];
        pool.getConnection((err, connection) => {
            if (err) {
              console.error('Error connecting to MySQL database: ', err);
              return;
            }
            connection.query(
                'SELECT * FROM users WHERE email=?',
                [email],
                (error,results)=>{
                    if(results.length>0){
                        errors.push('ユーザー登録に失敗しました。');
                        res.render('signup.ejs',{errors:errors});
                        connection.release(); // コネクションプールを返却
                    }else{
                        next();
                        connection.release(); // コネクションプールを返却
                    }
                }
            );
        });
    },

    (req,res)=>{
        const username = req.body.username;
        const email = req.body.email;
        const password = req.body.password;
        const unit_price = req.body.unit_price;
        bcrypt.hash(password,10,(error,hash)=>{
            pool.getConnection((err, connection) => {
                if (err) {
                  console.error('Error connecting to MySQL database: ', err);
                  return;
                }
                connection.query(
                    'INSERT INTO users (name, email, password, unit_price) VALUES(?,?,?,?)',
                    [username,email,hash,unit_price],
                    (error,results)=>{
                        req.session.createUserName = username;
                        req.session.createUserEmail = email;
                        let data ={
                            name : username,
                            email : email
                        }
                        res.redirect('/signup-confirm');
                        connection.release(); // コネクションプールを返却
                    }
                );
            });
        });
    }

);

app.listen(process.env.PORT || 3000);

