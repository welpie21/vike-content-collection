import type { ZodSchema } from "zod";

declare global {
	namespace Vike {
		interface Config {
			Content?: {
				schema: ZodSchema;
			};
		}
		interface ConfigResolved {
			Content?: {
				schema: ZodSchema;
			};
		}
	}
}
