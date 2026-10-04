// portal/src/services/ser-sftp.js
const SftpClient = require('ssh2-sftp-client');

function sftpConfig() {
  return {
    host:             process.env.SER_SFTP_HOST,
    port:             parseInt(process.env.SER_SFTP_PORT || '22'),
    username:         process.env.SER_SFTP_USER,
    password:         process.env.SER_SFTP_PASS,
    readyTimeout:     20000,
    retries:          2,
    retry_factor:     2,
    retry_minTimeout: 2000,
  };
}

async function uploadStmupdToSer(xmlBuffer, filename) {
  const sftp = new SftpClient('portal-ser-stmupd');
  const remotePath = `${process.env.SER_SFTP_PATH_IN || '/Eingang'}/${filename}`;
  try {
    await sftp.connect(sftpConfig());
    await sftp.put(xmlBuffer, remotePath);
    console.log(`[Portal/SER SFTP] Hochgeladen: ${remotePath}`);
  } finally {
    await sftp.end();
  }
}

module.exports = { uploadStmupdToSer };
