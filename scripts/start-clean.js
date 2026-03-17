const { execSync, spawn } = require("child_process");

const targetPort = Number(process.env.PORT || 3000);

function getPidsOnPortWindows(port) {
  try {
    const output = execSync(`netstat -ano -p tcp | findstr :${port}`, {
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8"
    });

    const lines = output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => line.includes("LISTENING"));

    const pids = new Set();
    for (const line of lines) {
      const parts = line.split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && /^\d+$/.test(pid)) {
        pids.add(pid);
      }
    }

    return Array.from(pids);
  } catch {
    return [];
  }
}

function killPidWindows(pid) {
  try {
    execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" });
    console.log(`KILLED PID=${pid}`);
  } catch {
    // Ignore if process already exited or inaccessible.
  }
}

function freePort(port) {
  if (process.platform === "win32") {
    const pids = getPidsOnPortWindows(port);
    pids.forEach(killPidWindows);
    return;
  }

  try {
    const pid = execSync(`lsof -ti tcp:${port}`, {
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8"
    }).trim();

    if (pid) {
      execSync(`kill -9 ${pid}`, { stdio: "ignore" });
      console.log(`KILLED PID=${pid}`);
    }
  } catch {
    // No listener found or lsof unavailable.
  }
}

freePort(targetPort);

const child = spawn(process.execPath, ["server.js"], {
  stdio: "inherit",
  shell: false
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
