import pluginSuite from "./plugin.bench";
import { parseCliOptions, run } from "./runner";
import runtimeSuite from "./runtime.bench";

const options = parseCliOptions();

await run([pluginSuite, runtimeSuite], options);
