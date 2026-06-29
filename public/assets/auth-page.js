(function initializeAuthPage(window, document, app) {
  if (!app) {
    return;
  }

  app.redirectIfAuthenticated();

  const statusContainer = document.getElementById("authStatus");
  const loginForm = document.getElementById("loginForm");
  const signupForm = document.getElementById("signupForm");
  const loginPanel = document.getElementById("loginPanel");
  const signupPanel = document.getElementById("signupPanel");
  const loginTab = document.getElementById("loginTab");
  const signupTab = document.getElementById("signupTab");
  const signupPassword = document.getElementById("signupPassword");
  const signupPasswordConfirm = document.getElementById("signupPasswordConfirm");

  app.showFlash(statusContainer);
  const initialPath = window.location.pathname.replace(/\/$/, "") || "/";

  function switchMode(mode) {
    const showingLogin = mode === "login";

    loginPanel.classList.toggle("d-none", !showingLogin);
    signupPanel.classList.toggle("d-none", showingLogin);
    loginTab.classList.toggle("active", showingLogin);
    loginTab.classList.toggle("btn-primary", showingLogin);
    loginTab.classList.toggle("btn-outline-primary", !showingLogin);
    signupTab.classList.toggle("active", !showingLogin);
    signupTab.classList.toggle("btn-primary", !showingLogin);
    signupTab.classList.toggle("btn-outline-primary", showingLogin);
    app.renderAlert(statusContainer, "", "");
  }

  function validateSignupPasswords() {
    if (signupPassword.value !== signupPasswordConfirm.value) {
      signupPasswordConfirm.setCustomValidity("Passwords do not match");
    } else {
      signupPasswordConfirm.setCustomValidity("");
    }
  }

  loginTab.addEventListener("click", function showLogin() {
    switchMode("login");
  });

  signupTab.addEventListener("click", function showSignup() {
    switchMode("signup");
  });

  signupPassword.addEventListener("input", validateSignupPasswords);
  signupPasswordConfirm.addEventListener("input", validateSignupPasswords);

  loginForm.addEventListener("submit", async function submitLogin(event) {
    event.preventDefault();
    app.renderAlert(statusContainer, "", "");

    if (!loginForm.reportValidity()) {
      return;
    }

    const submitButton = loginForm.querySelector('button[type="submit"]');

    try {
      app.setButtonLoading(submitButton, true, "Logging in...");
      const data = await app.apiFetch("/auth/login", {
        method: "POST",
        body: {
          email: loginForm.email.value.trim(),
          password: loginForm.password.value
        },
        skipAuth: true
      });

      app.setSession(data);
      app.setFlash("success", "Login successful.");
      window.location.href = "/dashboard";
    } catch (error) {
      app.renderAlert(statusContainer, "danger", app.extractErrorMessage(error));
    } finally {
      app.setButtonLoading(submitButton, false);
    }
  });

  signupForm.addEventListener("submit", async function submitSignup(event) {
    event.preventDefault();
    app.renderAlert(statusContainer, "", "");
    validateSignupPasswords();

    if (!signupForm.reportValidity()) {
      return;
    }

    const submitButton = signupForm.querySelector('button[type="submit"]');

    try {
      app.setButtonLoading(submitButton, true, "Creating account...");
      const data = await app.apiFetch("/auth/signup", {
        method: "POST",
        body: {
          name: signupForm.name.value.trim(),
          email: signupForm.email.value.trim(),
          password: signupForm.password.value
        },
        skipAuth: true
      });

      app.setSession(data);
      app.setFlash("success", "Account created.");
      window.location.href = "/dashboard";
    } catch (error) {
      app.renderAlert(statusContainer, "danger", app.extractErrorMessage(error));
    } finally {
      app.setButtonLoading(submitButton, false);
    }
  });

  switchMode(initialPath === "/signup" ? "signup" : "login");
})(window, document, window.StockInsightsApp);
