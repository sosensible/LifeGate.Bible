#!/bin/sh
# Check the one thing in this image that can be built for the wrong machine,
# then hand over to the server.
#
# better-sqlite3 is a native addon. Nitro cannot bundle one, so the build ships
# a compiled .node file and it has to match both the architecture (amd64) and
# the C library (glibc, not musl) of whatever runs it. When it does not, Node's
# own error is a loader message about ELF headers or missing symbols, several
# frames deep in a dependency, and it looks nothing like "you built this on the
# wrong machine". This turns that into one sentence.
set -e

node -e '
const path = "/app/.output/server/node_modules/better-sqlite3";
try {
  const Database = require(path);
  new Database(":memory:").close();
}
catch (error) {
  console.error("");
  console.error("  The SQLite native module in this image does not work here.");
  console.error("");
  console.error("  This container is " + process.platform + "/" + process.arch + ".");
  console.error("  The module must be built for the SAME architecture and the same");
  console.error("  C library. Building on Apple Silicon, or building on Debian and");
  console.error("  running on Alpine, both produce exactly this failure.");
  console.error("");
  console.error("  Build with both stages pinned to linux/amd64 on a glibc base");
  console.error("  (see Dockerfile), or let CI build it: .github/workflows/image.yml");
  console.error("");
  console.error("  Underlying error: " + (error && error.message ? error.message : error));
  console.error("");
  process.exit(1);
}
'

exec "$@"
