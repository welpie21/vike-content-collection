import type { ZodSchema } from "zod";

declare global {
	namespace Vike {
		interface Config {
			Content?: ZodSchema;
		}
		interface ConfigResolved {
			Content?: ZodSchema;
		}
	}
}
