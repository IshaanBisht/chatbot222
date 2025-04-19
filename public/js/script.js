// Toggle password visibility
let closedlock = document.getElementById("closedlock");
let password = document.getElementById("password");

if (closedlock && password) {
  closedlock.onclick = function () {
    if (password.type == "password") {
      password.type = "text";
      closedlock.src = "image/bxs-lock-open.svg";
    } else {
      password.type = "password";
      closedlock.src = "image/bxs-lock.svg";
    }
  };
}

// Chat functionality
const socket = io();
const form = document.getElementById("message-form");
const input = document.getElementById("message-input");
const chatBox = document.getElementById("chat-box");

// Connection logging
socket.on('connect', () => {
  console.log('Connected to Socket.IO server');
});

socket.on('disconnect', () => {
  console.log('Disconnected from Socket.IO server');
});

socket.on('connect_error', (error) => {
  console.error('Socket.IO connection error:', error);
});

// Message submission
form.addEventListener("submit", (e) => {
  e.preventDefault();
  
  const message = input.value.trim();
  if (message === "") return;

  // Add temporary message to UI immediately
  const tempDiv = document.createElement("div");
  tempDiv.classList.add("msg", "you");
  tempDiv.innerHTML = `<strong>You:</strong> ${message}`;
  chatBox.appendChild(tempDiv);
  chatBox.scrollTop = chatBox.scrollHeight;

  // Emit message to server
  socket.emit("send_message", {
    sender: window.currentUserId,
    receiver: window.chatUserId,
    content: message,
  });

  input.value = ""; // Clear input
});

// Handle incoming messages
socket.on("receive_message", (message) => {
  console.log("Received message:", message);
  
  const isYou = message.sender === window.currentUserId;
  
  if (isYou) {
    // Find the temporary message and update it if needed
    const messages = chatBox.querySelectorAll('.msg.you');
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && !lastMessage.dataset.persisted) {
      lastMessage.dataset.persisted = true;
      return;
    }
  }
  
  // Show message from other user
  const div = document.createElement("div");
  div.classList.add("msg", isYou ? "you" : "them");
  div.innerHTML = `<strong>${isYou ? "You" : window.chatUserName}:</strong> ${message.content}`;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
});