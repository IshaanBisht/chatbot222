require('dotenv').config();
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const express = require("express");
const path = require("path");
const session = require("express-session");
const bcrypt = require("bcrypt");
const http = require("http");
const socketIo = require("socket.io");
const sharedSession = require("express-socket.io-session");

const collection = require("./config"); // Mongoose user schema
const Message = require("./messageModel");
const User = collection;

const app = express();
const server = http.createServer(app);
const io = socketIo(server);



// Session config
const sessionMiddleware = session({
  secret: "your_secret_key",
  resave: false,
  saveUninitialized: false,
});

app.use(sessionMiddleware);

// Share session with Socket.IO
io.use(sharedSession(sessionMiddleware, {
  autoSave: true
}));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "../public")));

// View engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "../views"));

// Middleware to protect routes
function requireLogin(req, res, next) {
  if (!req.session.userId) return res.redirect("/login");
  next();
}

// Routes
app.get("/", (req, res) => {
  if (req.session.userId) return res.redirect("/users");
  res.redirect("/login");
});


app.get('/register', (req, res) => {
  res.render('register', { 
    error: null,
    formData: null 
  });
});


// Register
// GET route - shows the registration form
app.get('/register', (req, res) => {
  res.render('register', { 
    error: null,
    formData: {
      firstName: '',
      lastName: '',
      email: ''
    }
  });
});


app.post('/register', async (req, res) => {
  const { firstName, lastName, email, password } = req.body;
  
  try {
    const existing = await User.findOne({ email });
    if (existing) {
      return res.render('register', {
        error: 'Email already registered',
        formData: req.body
      });
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ 
      firstName, 
      lastName, 
      email, 
      password: hashed 
    });
    
    req.session.userId = user._id;
    res.redirect('/users');
    
  } catch (error) {
    console.error('Registration error:', error);
    res.render('register', {
      error: error.message || 'Registration failed',
      formData: req.body
    });
  }
});


// Login
app.get("/login", (req, res) => {
  res.render("login");
});


app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.send("Invalid email or password");
  }

  req.session.userId = user._id;
  res.redirect("/users");
});
// Email transporter configuration
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USERNAME,
    pass: process.env.EMAIL_PASSWORD
  }
});

// Password Reset Routes
app.get('/forgot-password', (req, res) => {
  res.render('forgot-password', { 
    error: null,
    success: null 
  });
});

app.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    // 1. Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.render('forgot-password', {
        error: 'No account with that email exists',
        success: null
      });
    }

    // 2. Generate hashed reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    
    user.resetToken = hashedToken;
    user.resetTokenExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes expiry
    await user.save({ validateBeforeSave: false });

    // 3. Send email with plaintext token (not the hashed one)
    const resetURL = `${req.protocol}://${req.get('host')}/reset-password/${resetToken}`;
    
    const mailOptions = {
      to: user.email,
      from: process.env.EMAIL_FROM,
      subject: 'Password Reset (Valid for 10 mins)',
      html: `
        <p>You requested a password reset. Click the link below to set a new password:</p>
        <a href="${resetURL}">${resetURL}</a>
        <p>If you didn't request this, please ignore this email.</p>
      `
    };

    await transporter.sendMail(mailOptions);

    res.render('forgot-password', {
      success: 'Password reset link sent to your email',
      error: null
    });

  } catch (err) {
    console.error('Forgot password error:', err);
    res.render('forgot-password', {
      error: 'Error sending email. Please try again.',
      success: null
    });
  }
});

app.get('/reset-password/:token', async (req, res) => {
  try {
    // Hash the token to compare with database
    const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');
    
    const user = await User.findOne({
      resetToken: hashedToken,
      resetTokenExpiry: { $gt: Date.now() }
    });

    if (!user) {
      return res.render('reset-password', {
        error: 'Password reset token is invalid or has expired',
        token: null
      });
    }

    res.render('reset-password', {
      error: null,
      token: req.params.token // Send the original token back to the form
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.render('reset-password', {
      error: 'Error processing your request',
      token: null
    });
  }
});

app.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;

  try {
    // Hash the token to compare with database
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    
    const user = await User.findOne({
      resetToken: hashedToken,
      resetTokenExpiry: { $gt: Date.now() }
    });

    if (!user) {
      return res.render('reset-password', {
        error: 'Password reset token is invalid or has expired',
        token: null
      });
    }

    // Update password and clear token
    user.password = await bcrypt.hash(newPassword, 10);
    user.resetToken = undefined;
    user.resetTokenExpiry = undefined;
    await user.save();

    res.render('reset-password', {
      success: 'Password has been successfully reset. You can now login with your new password.',
      error: null,
      token: null
    });
  } catch (error) {
    console.error('Password reset error:', error);
    res.render('reset-password', {
      error: 'Error resetting password',
      token: null
    });
  }
});


// User list
app.get("/users", requireLogin, async (req, res) => {
  const users = await User.find({ _id: { $ne: req.session.userId } });
  const currentUser = await User.findById(req.session.userId);
  res.render("users", { users, currentUser });
});

// Chat route
app.get("/chat/:id", requireLogin, async (req, res) => {
  const currentUser = await User.findById(req.session.userId);
  const chatUser = await User.findById(req.params.id);

  const messages = await Message.find({
    $or: [
      { sender: currentUser._id, receiver: chatUser._id },
      { sender: chatUser._id, receiver: currentUser._id },
    ],
  }).sort("timestamp");

  res.render("chat", { currentUser, chatUser, messages });
});

// Socket.IO handling
io.on("connection", (socket) => {
  const session = socket.handshake.session;
  
  if (!session?.userId) return;

  const userId = session.userId.toString();
  socket.join(userId); // Join room with user's ID

  console.log(`User ${userId} connected`);

  socket.on("send_message", async ({ sender, receiver, content }) => {
    try {
      // Validate all required fields
      if (!sender || !receiver || !content) {
        console.error("Missing required fields");
        return;
      }

      // Create and save the message
      const message = await Message.create({ 
        sender, 
        receiver, 
        content,
        timestamp: new Date() 
      });

      // Emit only to the sender and receiver
      io.to(sender).to(receiver).emit("receive_message", message);
      
    } catch (error) {
      console.error("Message sending error:", error);
    }
  });
});

// Start server
const PORT = process.env.PORT || 7000;
server.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));

