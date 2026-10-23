import pino from "pino";
// skeleton so the test fails on behaviour, not on a missing import
export const createLogger = (stream?: pino.DestinationStream, level = "info") => pino({ level }, stream);
