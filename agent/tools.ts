import { Type, type ToolListUnion } from "@google/genai";

export const tools: ToolListUnion = [
  {
    functionDeclarations: [
      {
        name: "openPosition",
        description: "Opens a position on Orca pool",
        parameters: {
          type: Type.OBJECT,
          properties: {
            id: {
              type: Type.STRING,
              description: "ID of the pool to open position in",
            },
            name: {
              type: Type.STRING,
              description: "Name of the pool to open position in",
            },
            range: {
              type: Type.NUMBER,
              description: "Range of the position to open min 0.05 max 0.25",
            },
            sentiment: {
              type: Type.STRING,
              description: '"BULLISH" or "BEARISH"',
            },
            reason: {
              type: Type.STRING,
              description: "Reason for selecting that specific pool and range",
            },
          },
          required: ["id", "name", "range", "sentiment", "reason"],
        },
      },
    ],
  },
];
