const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/user.model");
const env = require("../config/env");
const ApiError = require("../utils/api-error");

function buildToken(user) {
  return jwt.sign(
    {
      email: user.email
    },
    env.jwtSecret,
    {
      subject: user.id,
      expiresIn: env.jwtExpiresIn
    }
  );
}

async function signup(payload) {
  const existingUser = await User.findOne({ email: payload.email.toLowerCase().trim() });

  if (existingUser) {
    throw new ApiError(409, "EMAIL_ALREADY_IN_USE", "Email is already registered");
  }

  const hashedPassword = await bcrypt.hash(payload.password, 10);

  const user = await User.create({
    name: payload.name.trim(),
    email: payload.email.toLowerCase().trim(),
    password: hashedPassword
  });

  const token = buildToken(user);

  return {
    user,
    token
  };
}

async function login(payload) {
  const user = await User.findOne({ email: payload.email.toLowerCase().trim() }).select("+password");

  if (!user) {
    throw new ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect");
  }

  const isPasswordValid = await bcrypt.compare(payload.password, user.password);

  if (!isPasswordValid) {
    throw new ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect");
  }

  const token = buildToken(user);
  const sanitizedUser = user.toObject();
  delete sanitizedUser.password;

  return {
    user: sanitizedUser,
    token
  };
}

module.exports = {
  signup,
  login
};

