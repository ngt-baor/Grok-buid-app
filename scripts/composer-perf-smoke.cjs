const PORT = Number(process.env.GROK_BUILD_SMOKE_PORT || 9222);
const BASE = `http://127.0.0.1:${PORT}`;

async function connectPage() {
  const response = await fetch(`${BASE}/json/list`);
  const targets = await response.json();
  const page = targets.find((target) => target.type === "page");
  if (!page?.webSocketDebuggerUrl) throw new Error("No app page target");

  const socket = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  };
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const messageId = ++id;
      pending.set(messageId, { resolve, reject });
      socket.send(JSON.stringify({ id: messageId, method, params }));
    });
  await send("Runtime.enable");
  await send("Page.bringToFront").catch(() => {});
  return { socket, send };
}

async function evaluate(send, expression) {
  const response = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    timeout: 30000,
  });
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
  }
  return response.result?.value;
}

function percentile(samples, value) {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * value))];
}

async function main() {
  const { socket, send } = await connectPage();
  const result = await evaluate(
    send,
    `(async () => {
      const input = document.querySelector('.composer textarea');
      const chat = document.querySelector('.chat');
      if (!(input instanceof HTMLTextAreaElement) || !(chat instanceof HTMLElement)) {
        throw new Error('Composer or chat not found');
      }
      const setValue = (value) => {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, value);
        input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
      };
      const settle = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const original = input.value;
      const typeSamples = [];
      const deleteSamples = [];
      let value = '';
      input.focus();
      setValue(value);
      await settle();
      for (let index = 0; index < 20; index += 1) {
        value += String.fromCharCode(97 + (index % 26));
        const start = performance.now();
        setValue(value);
        await settle();
        typeSamples.push(performance.now() - start);
      }
      for (let index = 0; index < 20; index += 1) {
        value = value.slice(0, -1);
        const start = performance.now();
        setValue(value);
        await settle();
        deleteSamples.push(performance.now() - start);
      }
      setValue(original);
      await settle();
      return {
        chatChildren: chat.children.length,
        bodyNodes: document.body.querySelectorAll('*').length,
        typeSamples,
        deleteSamples,
      };
    })()`
  );
  socket.close();

  const typeP95Ms = percentile(result.typeSamples, 0.95);
  const deleteP95Ms = percentile(result.deleteSamples, 0.95);
  const summary = {
    chatChildren: result.chatChildren,
    bodyNodes: result.bodyNodes,
    typeP95Ms: Number(typeP95Ms.toFixed(1)),
    deleteP95Ms: Number(deleteP95Ms.toFixed(1)),
  };
  console.log(JSON.stringify(summary, null, 2));
  if (typeP95Ms > 50 || deleteP95Ms > 50 || result.chatChildren > 160) {
    throw new Error("Composer performance regression");
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
