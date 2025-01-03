import express from "express";
import morgan from "morgan";
import dotenv from "dotenv";
import mysql from "mysql"

import { Server } from "socket.io";
import { createServer } from "node:http";

dotenv.config()
const port = process.env.PORT ?? 3000;

const app = express();
const server = createServer(app);
const io = new Server(server, {
    connectionStateRecovery: {
        maxDisconnectionDuration: 30000, // 30 seconds
    },
});

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTO_INCREMENT,
        content TEXT,
        user TEXT
    )`,
    (error) => {
        if (error) throw error;
    }
);

io.on('connection', (socket) => {
    console.log('a user has connected!!');

    socket.on('disconected', () => {
        console.log('An user has disconnected');
    });

    socket.on('chat message', (msg) => {
        const username = socket.handshake.auth.username ?? 'anonymous'
        console.log(username);
        const sql = "INSERT INTO messages (content, user) VALUES (?, ?)";
        const params = [msg, username];
        pool.query(sql, params, (error, results) => {
            if (error) {
                console.error("Error inserting message:", error);
                return;
            }

            const insertedId = results.insertId;
            console.log(`Message inserted with ID: ${insertedId}`);

            io.emit("chat message", msg, insertedId, username);
        });
    });

    if(!socket.recovered) {
        const sql = "SELECT id, content, user FROM messages where id > ?";
        const params = [socket.handshake.auth.serverOffset ?? 0];

        pool.query(sql, params, (error, results) => {
            if (error) {
                console.error("Error retrieving initial messages:", error);
                return;
            }
            results.forEach((row) => {
                io.emit("chat message", row.content, row.id, row.user);
            });
        });
    }
});

app.use(morgan('dev'))

app.use(express.static(process.cwd() + "/client"));
app.get("/", (req, res) => {
    res.sendFile(process.cwd() + "/client/index.html");
});

server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
