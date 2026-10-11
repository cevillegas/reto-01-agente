const chat = document.getElementById("chat");
const form = document.getElementById("form");
const input = document.getElementById("input");
const sendBtn = form.querySelector("button");
const health = document.getElementById("health");
const confirmBanner = document.getElementById("confirm-banner");

const sessionId = "web_" + Math.random().toString(36).slice(2, 10);

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function addMsg(role, text) {
  const m = el("div", "msg " + role, text);
  chat.appendChild(m);
  chat.scrollTop = chat.scrollHeight;
  return m;
}

function addToolCall(tc) {
  const box = el("div", "toolcall" + (tc.ok ? "" : " err"));
  box.appendChild(el("div", "tname", "🔧 " + tc.name));
  box.appendChild(el("div", "targs", JSON.stringify(tc.arguments)));
  box.appendChild(el("div", "tres", (tc.ok ? "✓ " : "✗ ") + tc.resultadoResumen));
  chat.appendChild(box);
  chat.scrollTop = chat.scrollHeight;
}

async function checkHealth() {
  try {
    const r = await fetch("/api/health");
    const j = await r.json();
    health.textContent = `${j.provider} · ${j.model}`;
  } catch {
    health.textContent = "sin backend";
  }
}

async function enviar(mensaje) {
  addMsg("user", mensaje);
  confirmBanner.classList.add("hidden");
  const thinking = addMsg("thinking", "pensando…");
  sendBtn.disabled = true;
  input.disabled = true;

  try {
    const r = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, message: mensaje }),
    });
    const j = await r.json();
    thinking.remove();

    if (j.toolCalls && j.toolCalls.length) {
      for (const tc of j.toolCalls) addToolCall(tc);
    }
    if (j.reply) addMsg("assistant", j.reply);
    if (j.needsConfirmation) confirmBanner.classList.remove("hidden");
  } catch (e) {
    thinking.remove();
    addMsg("assistant", "Error de red: " + e.message);
  } finally {
    sendBtn.disabled = false;
    input.disabled = false;
    input.focus();
  }
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const txt = input.value.trim();
  if (!txt) return;
  input.value = "";
  enviar(txt);
});

document.querySelectorAll(".chip").forEach((c) => {
  c.addEventListener("click", () => {
    input.value = c.dataset.text;
    input.focus();
  });
});

checkHealth();
addMsg("assistant", 'Hola. Soy el agente de registro como proveedor. Pídeme procesar un caso, por ejemplo: Procesa el caso "ec-corp-andina". No envíes nada todavía.');
