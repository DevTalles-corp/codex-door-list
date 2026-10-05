import { createCapacityEnvironment } from "./local-capacity-environment.mjs";
import { verifyCapacityUpgrade } from "./run-capacity-upgrade.mjs";

const environment = await createCapacityEnvironment({ legacy:true });
try {
  await environment.start();
  await verifyCapacityUpgrade(environment);
  await environment.testDb();
  await environment.run("npm",["run","test:e2e","--","capacity-limits.spec.ts","registration-to-check-in.spec.ts",...process.argv.slice(2)],{ visible:true,env:await environment.browserEnv() });
} catch (error) { console.error(error.message); process.exitCode=1; }
finally { await environment.stop().catch((error) => { console.error(error.message); process.exitCode=1; }); }
