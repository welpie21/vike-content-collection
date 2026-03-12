import type { ZodSchema } from "zod";
import type { ContentCollectionDefinition } from "./index.js";

declare global {
	namespace Vike {
		interface Config {
			Content?: ZodSchema | ContentCollectionDefinition;
		}
		interface ConfigResolved {
			Content?: ZodSchema | ContentCollectionDefinition;
		}
	}
}
