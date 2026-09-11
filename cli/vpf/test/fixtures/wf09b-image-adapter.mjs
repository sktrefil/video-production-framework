export default {
  async generate(request) {
    const bytes = Buffer.alloc(24);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
    bytes.writeUInt32BE(request.width, 16);
    bytes.writeUInt32BE(request.height, 20);
    return {
      bytes,
      mimeType: "image/png",
      providerRequestIds: ["wf09b-test-request"]
    };
  }
};
