import { defineConfig } from "../../../src/index.js";

export default defineConfig({
  environments: {
    local: { url: "http://127.0.0.1:5984" },
    prod: { url: "https://db.example.com", protected: true },
  },
  databases: ["mydb"],
});
