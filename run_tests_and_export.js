const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const PORT = 8090;
const BASE_DIR = __dirname;
const DOCS_DIR = path.join(BASE_DIR, "docs");

if (!fs.existsSync(DOCS_DIR)) {
  fs.mkdirSync(DOCS_DIR, { recursive: true });
}

let server;
let chromeProcess;

function mimeType(ext) {
  switch (ext) {
    case ".html": return "text/html";
    case ".js": return "application/javascript";
    case ".css": return "text/css";
    case ".png": return "image/png";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".pdf": return "application/pdf";
    default: return "application/octet-stream";
  }
}

server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/api/save-preview-pdf") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
      try {
        const payload = JSON.parse(body);
        if (payload.error) {
          console.error("Runner reported error:", payload.error);
          if (payload.stack) console.error(payload.stack);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "error" }));
          cleanup(1);
          return;
        }

        // Process September 2026 PDF
        if (payload.pdfSepBase64) {
          const dataUri = payload.pdfSepBase64;
          const matches = dataUri.match(/^data:application\/pdf(?:;filename=[^;]+)?;base64,(.+)$/);
          const base64Data = matches ? matches[1] : dataUri.split(",")[1];
          const pdfBuffer = Buffer.from(base64Data, "base64");
          const targetSepPath = path.join(DOCS_DIR, "Absensi_NUR_ROHMAN_SETIAWAN_September_2026.pdf");
          fs.writeFileSync(targetSepPath, pdfBuffer);
          console.log(`[SUCCESS] September 2026 PDF saved to ${targetSepPath} (${pdfBuffer.length} bytes, ${payload.pageCountSep} page(s))`);
        }

        // Process August 2026 PDF
        if (payload.pdfAguBase64) {
          const dataUri = payload.pdfAguBase64;
          const matches = dataUri.match(/^data:application\/pdf(?:;filename=[^;]+)?;base64,(.+)$/);
          const base64Data = matches ? matches[1] : dataUri.split(",")[1];
          const pdfBuffer = Buffer.from(base64Data, "base64");
          const targetAguPath = path.join(DOCS_DIR, "pdf-preview-agustus-2026.pdf");
          fs.writeFileSync(targetAguPath, pdfBuffer);
          console.log(`[SUCCESS] August 2026 PDF saved to ${targetAguPath} (${pdfBuffer.length} bytes, ${payload.pageCountAgu} page(s))`);
        }

        // Print test logs
        console.log("\n=== TEST SUITE RESULTS ===");
        let allPass = true;
        if (payload.testLogs && Array.isArray(payload.testLogs)) {
          payload.testLogs.forEach(t => {
            if (t.pass) {
              console.log(`[PASS] ${t.message}`);
            } else {
              console.error(`[FAIL] ${t.message}`);
              allPass = false;
            }
          });
        }
        console.log("==========================\n");

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", allPass }));

        setTimeout(() => {
          cleanup(allPass ? 0 : 1);
        }, 1000);
      } catch (err) {
        console.error("Error processing request:", err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "error", message: err.message }));
        cleanup(1);
      }
    });
    return;
  }

  // Serve static files
  let reqPath = req.url.split("?")[0];
  if (reqPath === "/") reqPath = "/test_runner.html";
  const filePath = path.join(BASE_DIR, reqPath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    res.writeHead(200, { "Content-Type": mimeType(path.extname(filePath)) });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found: " + reqPath);
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Server listening on http://127.0.0.1:${PORT}`);
  launchChrome();
});

function launchChrome() {
  const chromePath = fs.existsSync("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe")
    ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
    : "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

  console.log(`Launching browser: ${chromePath}`);
  const args = [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    `http://127.0.0.1:${PORT}/test_runner.html`
  ];

  chromeProcess = spawn(chromePath, args);

  chromeProcess.on("error", (err) => {
    console.error("Failed to launch browser:", err);
    cleanup(1);
  });

  // Timeout after 30 seconds
  setTimeout(() => {
    console.error("Timed out waiting for test runner");
    cleanup(1);
  }, 30000);
}

function cleanup(exitCode) {
  if (chromeProcess) {
    try { chromeProcess.kill(); } catch (e) {}
  }
  if (server) {
    server.close(() => {
      process.exit(exitCode);
    });
  } else {
    process.exit(exitCode);
  }
}
