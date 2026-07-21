import { afterEach, describe, expect, it } from "vitest";
import { io as client, type Socket } from "socket.io-client";
import { buildApp } from "../src/app.js";

let socket: Socket | undefined;
afterEach(() => socket?.close());

describe("Socket.IO vertical slice", () => {
  it("crea una sala y publica el roster", async () => {
    const { app, io } = await buildApp({ clientOrigin: "http://localhost" });
    const homepage = await app.inject({ method: "GET", url: "/" });
    expect(homepage.statusCode).toBe(200);
    expect(homepage.body).toContain("Duelo de Saberes");
    await app.listen({ port: 0, host: "127.0.0.1" });
    const address = app.server.address();
    if (!address || typeof address === "string") throw new Error("Servidor no disponible");
    socket = client(`http://127.0.0.1:${address.port}`, { transports: ["websocket"] });
    await new Promise<void>((resolve) => socket!.once("connect", resolve));
    const result = await new Promise<any>((resolve) => socket!.emit("room:create", { displayName: "Francois" }, resolve));
    expect(result.ok).toBe(true);
    expect(result.data.room.gameConfig).toEqual({ difficulty: "easy", desiredPlayers: 2 });
    expect(result.data.room.players[0].displayName).toBe("Francois");
    expect(result.data.sessionToken).toBeTruthy();
    socket.close(); await io.close(); await app.close();
  });
});
