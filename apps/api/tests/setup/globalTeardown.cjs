// Jest holds the process open if anything still has a handle; the Prisma client
// each suite opened is disconnected in its own afterAll, so nothing to do here
// beyond giving Node a tick to flush.
module.exports = async () => {
  await new Promise((resolve) => setImmediate(resolve));
};
