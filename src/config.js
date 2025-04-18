const mongoose = require("mongoose");
const bcrypt = require('bcrypt');

// Async function to connect to MongoDB
async function connectDB() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/Login-tut");
        console.log("✅ Database Connected Successfully");
    } catch (error) {
        console.error("❌ Database Connection Failed:", error);
        process.exit(1); // Exit process if database connection fails
    }
}
connectDB();

// Create Schema
const LoginSchema = new mongoose.Schema({
    firstName: { 
        type: String, 
        required: [true, 'First name is required'],
        trim: true
    },
    lastName: { 
        type: String, 
        required: [true, 'Last name is required'],
        trim: true
    },
    email: { 
        type: String, 
        required: [true, 'Email is required'],
        unique: true,
        trim: true,
        lowercase: true,
        match: [/.+\@.+\..+/, 'Please enter a valid email address']
    },
    password: { 
        type: String, 
        required: [true, 'Password is required'],
        minlength: [6, 'Password must be at least 6 characters']
    },
    resetToken: {
        type: String,
        select: false // Won't be returned in queries unless explicitly asked for
    },
    resetTokenExpiry: {
        type: Date,
        select: false
    }
}, {
    timestamps: true // Adds createdAt and updatedAt fields automatically
});

// Password hashing middleware
LoginSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (err) {
        next(err);
    }
});

// Method to compare passwords
LoginSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

// Method to generate reset token
LoginSchema.methods.createPasswordResetToken = function() {
    const crypto = require('crypto');
    const resetToken = crypto.randomBytes(32).toString('hex');
    
    this.resetToken = crypto
        .createHash('sha256')
        .update(resetToken)
        .digest('hex');
    
    this.resetTokenExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes expiry
    
    return resetToken;
};

// Create Mongoose Model
const User = mongoose.model("User", LoginSchema);

module.exports = User;