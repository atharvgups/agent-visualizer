import { createApp } from "./api";

const port = Number(process.env.PORT ?? 4400);
createApp().listen(port, () => {
  console.log(`agent-visualizer server listening on http://localhost:${port}`);
});
