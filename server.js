const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

let state = {
  aka: { score: 0, penalties: {}, senshu: false },
  ao: { score: 0, penalties: {}, senshu: false },
  timer: { minutes: 1, seconds: 30, running: false },
  tatami: 1,
  winner: null // Tambahan: simpan pemenang
};

// TIMER sinkron setiap detik
setInterval(() => {
  if (state.timer.running) {
    let total = state.timer.minutes * 60 + state.timer.seconds;
    if (total > 0) {
      total--;
      state.timer.minutes = Math.floor(total / 60);
      state.timer.seconds = total % 60;
      io.emit("state", state);
    } else {
      state.timer.running = false;
      checkWinner(); // cek siapa menang saat waktu habis
      io.emit("state", state);
    }
  }
}, 1000);

// Fungsi penentuan pemenang otomatis
function checkWinner() {
  // Kalau sudah ada pemenang karena selisih poin, jangan cek lagi
  if (state.winner) return;

  // Kalau ada yang kena penalti H (Hansoku), langsung kalah
  if (state.aka.penalties.h) {
    state.winner = "ao";
    return;
  }
  if (state.ao.penalties.h) {
    state.winner = "aka";
    return;
  }

  // Bandingkan skor
  if (state.aka.score > state.ao.score) {
    state.winner = "aka";
  } else if (state.ao.score > state.aka.score) {
    state.winner = "ao";
  } else {
    // Kalau draw
    if (state.aka.senshu) state.winner = "aka";
    else if (state.ao.senshu) state.winner = "ao";
    else state.winner = "hantei"; // keputusan wasit (manual)
  }
}



io.on("connection", (socket) => {
  console.log("Client connected");
  socket.emit("state", state);

  socket.on("update", (data) => {
    switch (data.type) {
      case "score":
        state[data.player].score += data.delta;
        if (state[data.player].score < 0) state[data.player].score = 0;

        // 🔥 Cek kemenangan otomatis jika selisih poin ≥ 8
        const selisih = Math.abs(state.aka.score - state.ao.score);
        if (selisih >= 8) {
          state.timer.running = false; // hentikan waktu
          state.winner = state.aka.score > state.ao.score ? "aka" : "ao";
        }
        break;

      case "penalty":
        state[data.player].penalties[data.penalty] = data.active;
        
        // Tambahan: langsung cek pemenang
        checkWinner();
        if (state.winner) {
          state.timer.running = false; // hentikan timer kalau ada pemenang
        }
        break;

      case "senshu":
        state.aka.senshu = data.value === "aka";
        state.ao.senshu = data.value === "ao";
        break;

      case "timer":
        state.timer = { ...state.timer, ...data.value };
        state.winner = null; // reset pemenang kalau timer diubah
        io.emit("state", state);
        break;

      case "reset-timer":
        state.timer = { minutes: 1, seconds: 30, running: false };
        state.winner = null;
        break;

      case "tatami":
        state.tatami = data.value;
        break;

      case "hantei":
        state.winner = data.winner;
        state.timer.running = false; // stop waktu
        break;


      case "reset":
        state = {
          aka: { score: 0, penalties: {}, senshu: false },
          ao: { score: 0, penalties: {}, senshu: false },
          timer: { minutes: 1, seconds: 30, running: false },
          tatami: 1,
          winner: null
        };
        break;
    }
    io.emit("state", state);
  });

  socket.on("disconnect", () => console.log("Client disconnected"));
});

server.listen(3000, () => console.log("Server jalan di http://localhost:3000"));
