const socket = io();

const myFace = document.getElementById("myFace");
const muteBtn = document.getElementById("muteBtn");
const cameraBtn = document.getElementById("cameraBtn");
const cameraList = document.getElementById("cameraList");
const peerFace = document.getElementById("peerFace");

let myStream;
let muted = false;
let cameraOff = false;
let roomName;
let nickName = "Anon";
let myPeerConnection;
let myDataChannel;

async function getCamera() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter((device) => device.kind == "videoinput");
    const currentCamera = myStream.getVideoTracks()[0];
    cameras.forEach((camera) => {
      const option = document.createElement("option");
      option.value = camera.deviceId;
      option.innerText = camera.label;
      cameraList.appendChild(option);
      if (camera.label === currentCamera.label) {
        option.selected = true;
      }
    });
  } catch (error) {
    console.log(error);
  }
}

async function getMedia(id) {
  const initialConstrains = {
    audio: true,
    video: { facingMode: "user" }
  };
  const cameraConstrains = {
    audio: true,
    video: { deviceId: { exact: id } }
  };
  try {
    myStream = await navigator.mediaDevices.getUserMedia(
      id ? cameraConstrains : initialConstrains
    );
    myFace.srcObject = myStream;
    if (!id) {
      await getCamera();
    }
  } catch (error) {
    console.log(error);
  }
}

function handleMuteBtn() {
  myStream.getAudioTracks().forEach((track) => {
    track.enabled = !track.enabled;
  });
  if (muted) {
    muteBtn.innerText = "Mute";
    muted = false;
  } else {
    muteBtn.innerText = "Unmute";
    muted = true;
  }
}

function handleCameraBtn() {
  myStream.getVideoTracks().forEach((track) => {
    track.enabled = !track.enabled;
  });
  if (cameraOff) {
    cameraBtn.innerText = "Turn Camera Off";
    cameraOff = false;
  } else {
    cameraBtn.innerText = "Turn Camera On";
    cameraOff = true;
  }
}

async function handleCameraChange() {
  await getMedia(cameraList.value);
  if (myPeerConnection) {
    const videoTrack = myStream.getVideoTracks()[0];
    const videoSender = myPeerConnection
      .getSenders()
      .find((sender) => sender.track.kind === "video");
    videoSender.replaceTrack(videoTrack);
  }
}

muteBtn.addEventListener("click", handleMuteBtn);
cameraBtn.addEventListener("click", handleCameraBtn);
cameraList.addEventListener("input", handleCameraChange);

// welcome Form

const welcomeBox = document.getElementById("welcome");
const welcomeForm = welcomeBox.querySelector("form");
const callBox = document.getElementById("call");

callBox.hidden = true;

function showRoom() {
  welcomeBox.classList.add("hidden");
  callBox.hidden = false;
}

async function startCall() {
  await getMedia();
  makeConnection();
}

async function handleWelcomeForm(event) {
  event.preventDefault();
  const input = welcomeForm.querySelector("input");
  await startCall();
  socket.emit("join_room", input.value, showRoom);
  roomName = input.value;
  input.value = "";
  const roomtitle = callBox.querySelector("h3");
  roomtitle.innerHTML = `Room : ${roomName}`;
}

welcomeForm.addEventListener("submit", handleWelcomeForm);

// Nickname

const nickNameBox = document.getElementById("nickName");
const nickNameForm = nickNameBox.querySelector("form");

function handleNickName(event) {
  event.preventDefault();
  const input = nickNameForm.querySelector("input");
  socket.emit("nickname", input.value);
  nickName = input.value;
  input.value = "";
  const nickTitle = nickNameBox.querySelector("h3");
  nickTitle.innerText = `Hello ${nickName}!`;
}

nickNameForm.addEventListener("submit", handleNickName);

// Chat Form

const chatBox = document.getElementById("chat");
const chatForm = chatBox.querySelector("form");
const chatList = document.querySelector("#chatList");

function addMessage(msg) {
  const li = document.createElement("li");
  li.innerText = msg;
  chatList.append(li);
}

function handleChatForm(event) {
  event.preventDefault();
  const input = chatForm.querySelector("input");
  if (myDataChannel) {
    myDataChannel.send(`${nickName} : ${input.value}`);
  }
  addMessage(`YOU : ${input.value}`);
  input.value = "";
}

chatForm.addEventListener("submit", handleChatForm);

// Leave

const leaveBtn = document.getElementById("leave");

function hiddenRoom() {
  welcomeBox.classList.remove("hidden");
  callBox.hidden = true;
  myStream.getTracks().forEach((track) => track.stop());
  myPeerConnection = "";
  chatList.innerHTML = "";
}

function handleLeave() {
  socket.emit("leave", roomName, hiddenRoom);
  roomName = null;
}

leaveBtn.addEventListener("click", handleLeave);

// Socket

socket.on("welcome", async (name) => {
  myDataChannel = myPeerConnection.createDataChannel("chat");
  myDataChannel.addEventListener("message", (event) => {
    addMessage(event.data);
  });
  const offer = await myPeerConnection.createOffer();
  myPeerConnection.setLocalDescription(offer);
  socket.emit("offer", offer, roomName);
  addMessage(`${name} Joined`);
});

socket.on("offer", async (offer) => {
  myPeerConnection.addEventListener("datachannel", (event) => {
    myDataChannel = event.channel;
    myDataChannel.addEventListener("message", (event) => {
      addMessage(event.data);
    });
  });
  myPeerConnection.setRemoteDescription(offer);
  const answer = await myPeerConnection.createAnswer();
  myPeerConnection.setLocalDescription(answer);
  socket.emit("answer", answer, roomName);
});

socket.on("answer", (answer) => {
  myPeerConnection.setRemoteDescription(answer);
});

socket.on("ice", (ice) => {
  myPeerConnection.addIceCandidate(ice);
});

socket.on("full_room", () => {
  const notice = welcomeBox.querySelector("h3");
  notice.innerText = "The Room is Full";
  myStream.getTracks().forEach((track) => track.stop());
  myPeerConnection = "";
});

socket.on("leave", (name) => {
  peerFace.srcObject = null;
  addMessage(`${name} Leaved`);
});

socket.on("room_list", (rooms) => {
  const roomList = welcomeBox.querySelector("ul");
  roomList.innerHTML = "";
  if (roomList.length === 0) {
    return;
  }
  rooms.forEach((room) => {
    const li = document.createElement("li");
    li.innerText = room;
    roomList.appendChild(li);
  });
});

// RTC

function makeConnection() {
  myPeerConnection = new RTCPeerConnection();
  myStream.getTracks().forEach((track) => {
    myPeerConnection.addTrack(track, myStream);
  });
  myPeerConnection.addEventListener("icecandidate", handleIce);
  myPeerConnection.addEventListener("addstream", handleAddStream);
}

function handleIce(data) {
  socket.emit("ice", data.candidate, roomName);
}

function handleAddStream(data) {
  peerFace.srcObject = data.stream;
}
