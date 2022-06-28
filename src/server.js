import http from "http";
import SocketIO from "socket.io";
import express from "express";

const app = express();

app.set("view engine", "pug");
app.set("views", __dirname + "/views");
app.use("/public", express.static(__dirname + "/public"));
app.get("/", (_, res) => res.render("home"));
app.get("/*", (_, res) => res.redirect("/"));

const httpServer = http.createServer(app);
const wsServer = SocketIO(httpServer);

function countRoom(roomName) {
  return wsServer.sockets.adapter.rooms.get(roomName)?.size;
}

function publicRoom() {
  const {
    sockets: {
      adapter: { sids, rooms }
    }
  } = wsServer;
  const publicRoom = [];
  rooms.forEach((value, key) => {
    if (sids.get(key) === undefined) {
      publicRoom.push(key);
    }
  });
  return publicRoom;
}

wsServer.on("connection", (socket) => {
  socket["nickname"] = "Anon";
  socket.on("join_room", (roomName, done) => {
    if (countRoom(roomName) === undefined || countRoom(roomName) < 2) {
      socket.join(roomName);
      socket.to(roomName).emit("welcome", socket.nickname);
      done();
      wsServer.sockets.emit("room_list", publicRoom());
    } else {
      wsServer.sockets.emit("full_room");
    }
  });
  socket.on("offer", (offer, roomName) => {
    socket.to(roomName).emit("offer", offer);
  });
  socket.on("answer", (answer, roomName) => {
    socket.to(roomName).emit("answer", answer);
  });
  socket.on("ice", (ice, roomName) => {
    socket.to(roomName).emit("ice", ice);
  });
  socket.on("nickname", (name) => {
    socket["nickname"] = name;
  });
  socket.on("leave", (roomName, done) => {
    socket.leave(roomName);
    socket.to(roomName).emit("leave", socket.nickname);
    done();
    wsServer.sockets.emit("room_list", publicRoom());
  });
});

const handleListen = () => console.log(`Listening on http://localhost:3000`);
httpServer.listen(process.env.PORT, handleListen);
