const bent = require("bent")
const os = require("os")
const downloadFile = require("./download-file")
const path = require("path")
const fs = require("fs")
const tar = require("tar")
const extractZip = require('extract-zip')

const getJSON = bent("json", {
  "User-Agent": "seveibar, frpc-bin (an npm module)",
})

const releases = {
  'linux': {
    arm64: 'linux_arm64.tar.gz',
    arm: 'linux_arm.tar.gz',
    x64: 'linux_amd64.tar.gz',
    mips: 'linux_mips.tar.gz',
    mips64: 'linux_mips64.tar.gz',
    mips64le: 'linux_mips64le.tar.gz'
  },
  'darwin': {
    arm64: 'darwin_arm64.tar.gz',
    x64: 'darwin_amd64.tar.gz'
  },
  'win32': {
    x64: 'windows_amd64.zip',
    ia32: 'windows_386.zip',
    arm64: 'windows_arm64.zip'
  },
  'freebsd': {
    x64: 'windows_amd64.zip',
  }
}

const platform = os.platform()
const arch = os.arch()
let osRelease = null
osRelease = releases[platform][arch]

// Originally derived from the package.json, but that approach doesn't allow for
// any patches to the bindings... Maybe only sync major versions in the future?
// Either that or tag the releases for older version e.g. 1.2.3-frpc6
const releaseVersionToUse = "0.58.1"

module.exports = async () => {
  // Get all the assets from the github release page
  const releaseAPIUrl = `https://api.github.com/repos/fatedier/frp/releases/tags/v${releaseVersionToUse}`
  const githubReleasesJSONPath = path.resolve(__dirname, "github_releases.json")
  let githubReleasesJSON
  if (!fs.existsSync(githubReleasesJSONPath)) {
    githubReleasesJSON = await getJSON(releaseAPIUrl)
    fs.writeFileSync(githubReleasesJSONPath, JSON.stringify(githubReleasesJSON))
  } else {
    githubReleasesJSON = JSON.parse(
      fs.readFileSync(githubReleasesJSONPath).toString()
    )
  }
  const { assets } = githubReleasesJSON

  // Find the asset for my operating system
  const myAsset = assets.find((asset) => asset.name.includes(osRelease))

  if (!myAsset) {
    throw new Error(
      `Couldn't find frp version compatible with ${osRelease},\n\nAvailable releases:\n${assets
        .map((a) => `\t* ${a.name}`)
        .join("\n")}`
    )
  }

  // Download the asset (which is a compressed version of the executable)
  // e.g. download something like frpc-ubuntu.tar.xz

  const downloadPath = path.resolve(__dirname, myAsset.name)
  const extractDirPath = path.resolve(
    __dirname,
    myAsset.name.includes('.tar.gz') ? myAsset.name.replace('.tar.gz', '') : myAsset.name.replace('.zip', '')
  )

  const frpPlatform = os.platform()
  const frpcPath = path.resolve(extractDirPath, frpPlatform === 'win32' ? "frpc.exe" : "frpc")
  const frpsPath = path.resolve(extractDirPath, frpPlatform === 'win32' ? "frps.exe" : 
    "frps"  )

  if (fs.existsSync(frpcPath) && fs.existsSync(frpsPath)) {
    return { frpsPath, frpcPath }
  }

  if (!fs.existsSync(path.join(__dirname, myAsset.name))) {
    console.log(`Downloading ${myAsset.name}...`)

    await downloadFile(
      myAsset.browser_download_url,
      path.resolve(__dirname, downloadPath)
    )
    await new Promise((r) => setTimeout(r, 100)) // prevents zlib issue
  }

  // Extract the files from the downloaded asset (i.e. pull out the frpc binary)
  // After this, you should have a "frpc" executable file
  if (!fs.existsSync(extractDirPath)) {
    console.log(`extracting ${myAsset.name}...`)
    if (downloadPath.includes('.tar.gz')) {
      let tarXPath = downloadPath
      await tar.x({
        file: tarXPath,
        z: true,
      })
      fs.unlinkSync(tarXPath)
    } else {
      await extractZip(downloadPath, { dir: __dirname })
    }

    console.log(frpcPath)
    if (!fs.existsSync(frpcPath)) {
      throw new Error(
        `For some reason, after extracting frp there was no frpc executable!`
      )
    }

    if (!fs.existsSync(frpsPath)) {
      throw new Error(
        `For some reason, after extracting frp there was no frps executable!`
      )
    }
  }
  console.log({ frpcPath, frpsPath })
  return { frpcPath, frpsPath }
}

if (!module.parent) {
  module.exports().then(() => { })
}
