function validateSignup(req) {
  const errors = [];
  const { name, email, password } = req.body;

  if (!name || String(name).trim().length < 2) {
    errors.push({ field: "name", code: "NAME_TOO_SHORT" });
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
    errors.push({ field: "email", code: "EMAIL_INVALID" });
  }

  if (!password || String(password).length < 8) {
    errors.push({ field: "password", code: "PASSWORD_TOO_SHORT" });
  }

  return errors;
}

function validateLogin(req) {
  const errors = [];
  const { email, password } = req.body;

  if (!email) {
    errors.push({ field: "email", code: "EMAIL_REQUIRED" });
  }

  if (!password) {
    errors.push({ field: "password", code: "PASSWORD_REQUIRED" });
  }

  return errors;
}

module.exports = {
  validateSignup,
  validateLogin
};

