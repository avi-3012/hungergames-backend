const express = require("express");
const { Server } = require("socket.io");
const app = express();
const port = process.env.PORT || 8080;
const room = "1111";
var users = 0;
var players = {
  // socket.id: {Name: "name", Color: "color", Ready: true/false}
};
var ready = {};
var readyCount = 0;
var sessionStatus = false;
var playerOrder = [];
var playerMeta = {};
var currentTurn = 0;

const server = require("http").createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  users += 1;
  console.log(socket.id);
  socket.on("join", async (data) => {
    await socket.join(room);
    players[socket.id] = data;
    io.to(room).emit("actionLog", {
      player: "System",
      action: `${players[socket.id]} has joined the game.`,
    });
    console.log(players);
  });
  socket.on("sessionStatus", () => {
    io.to(socket.id).emit("sessionStatus", sessionStatus);
  });
  socket.on("ready", (data) => {
    ready[socket.id] = data;
    readyCount += 1;
    io.to(room).emit("actionLog", {
      player: "System",
      action: `Player ready: ${readyCount} / ${Object.keys(players).length}`,
    });
    console.log(readyCount, Object.keys(players).length);
    if (readyCount == Object.keys(players).length) {
      sessionStatus = true;
      console.log("Game is starting");
      io.to(room).emit("start_game", players);
      var keys = Object.keys(players);
      for (var i = 0; i < keys.length; i++) {
        playerOrder.push(players[keys[i]]);
        playerMeta[players[keys[i]]] = { AP: 10, Alive: true, Defend: false };
      }
      io.to(room).emit("turn", playerOrder[currentTurn]);
    }
  });
  socket.on("turn", () => {
    currentTurn += 1;
    io.to(room).emit("turn", playerOrder[currentTurn]);
  });
  socket.on("roll", ({ name, player, move, event }) => {
    var reqroll = 0;
    if (name != playerOrder[currentTurn]) {
      io.to(room).emit("roll", { roll: 0, move: "Missed" });
      return;
    }
    if (
      playerMeta[player]["AP"] == undefined &&
      playerMeta[name] == undefined
    ) {
      io.to(room).emit("roll", { roll: 0, move: "Missed" });
      return;
    }
    var roll = Math.floor(Math.random() * 20) + 1;
    if (event == "Kill") {
      reqroll = playerMeta[player]["AP"];
      if (roll > playerMeta[player]["AP"]) {
        playerMeta[player]["Alive"] = false;
        playerMeta[name]["AP"] -= 2;
        if (playerMeta[player]["Defend"]) {
          playerMeta[player]["Defend"] = false;
          playerMeta[player]["AP"] -= 2;
        }
      } else {
        playerMeta[name]["AP"] -= 1;
        if (playerMeta[player]["Defend"]) {
          playerMeta[player]["AP"] -= 2;
          playerMeta[player]["Defend"] = false;
        }
      }
    } else if (event == "Defend") {
      reqroll = playerMeta[name]["AP"];
      if (
        roll > playerMeta[name]["AP"] &&
        playerMeta[name]["Defend"] == false
      ) {
        playerMeta[name]["AP"] += 4;
        playerMeta[name]["Defend"] = true;
      } else {
        playerMeta[name]["AP"] += 1;
      }
    } else if (event == "Revive") {
      reqroll = playerMeta[player]["AP"];
      if (
        roll > playerMeta[player]["AP"] &&
        playerMeta[player]["Alive"] == false
      ) {
        playerMeta[player]["Alive"] = true;
        playerMeta[name]["AP"] -= 2;
      } else {
        playerMeta[name]["AP"] -= 1;
      }
    } else if (event == "Support") {
      reqroll = playerMeta[player]["AP"];
      if (roll > playerMeta[player]["AP"]) {
        playerMeta[name]["AP"] += 2;
        playerMeta[player]["AP"] += 2;
      } else {
        playerMeta[name]["AP"] += 1;
        playerMeta[player]["AP"] += 1;
      }
    }
    setTimeout(() => {
      if (reqroll > roll) {
        console.log(player);
        io.to(room).emit("describeturn", player);
      }
    }, 4000);

    io.to(room).emit("roll", {
      name,
      roll,
      reqroll,
      move,
      event,
      player,
    });
  });
  socket.on("describe", ({ name, describe }) => {
    io.to(room).emit("describe", { name, describe });
    var currentPlayer = playerOrder[currentTurn];
    currentTurn += 1;
    console.log(currentTurn, playerOrder.length);
    if (currentTurn == playerOrder.length) {
      currentTurn = 0;
    }
    var i = true;
    while (i) {
      if (playerMeta[playerOrder[currentTurn]]["Alive"] == false) {
        currentTurn += 1;
        if (currentTurn == playerOrder.length) {
          currentTurn = 0;
        }
        if (currentPlayer == playerOrder[currentTurn]) {
          i = false;
          io.to(room).emit("win", playerOrder[currentTurn]);
          return;
        }
      } else {
        i = false;
      }
    }
    io.to(room).emit("turn", playerOrder[currentTurn]);
  });
  socket.on("players", () => {
    io.to(socket.id).emit("players", playerMeta);
  });
  socket.on("disconnect", () => {
    users -= 1;
    io.to(room).emit("actionLog", {
      player: "System",
      action: `Player ${players[socket.id]} disconnected`,
    });
    console.log(ready[socket.id]);
    if (ready[socket.id]) {
      console.log("ready -1");
      readyCount -= 1;
      delete ready[socket.id];
    }
    if (playerMeta[players[socket.id]] != undefined) {
      playerOrder = playerOrder.filter((item) => item !== players[socket.id]);
      delete playerMeta[players[socket.id]];
    }
    if (users == 0) {
      readyCount = 0;
      sessionStatus = false;
    }
    if (readyCount == Object.keys(players).length && users != 0) {
      sessionStatus = true;
      console.log("Game is starting");
      io.to(room).emit("start_game", players);
    }
    delete players[socket.id];
    if (readyCount == Object.keys(players).length && users != 0) {
      sessionStatus = true;
      console.log("Game is starting");
      io.to(room).emit("start_game", players);
    }

    console.log(players);
    console.log("user disconnected");
  });
});

server.listen({ host: "0.0.0.0", port: 8080 }, () => {
  console.log(`Server is running on port ${port}`);
});

app.get("/", (req, res) => {
  io.socketsLeave(room);
  users = 0;
  players = {
    // socket.id: {Name: "name", Color: "color", Ready: true/false}
  };
  ready = {};
  readyCount = 0;
  sessionStatus = false;
  playerOrder = [];
  playerMeta = {};
  currentTurn = 0;
  res.send("Hello World!");
});
