// node modules
import underscore from 'underscore'
import _ from 'underscore-contrib'
import c from 'chalk'
import fs from 'fs'
import mkd from 'mkdirp'
import unzip from 'unzip'
// import Promise from 'bluebird'
import resumer from 'resumer'
import zip from 'epub-zip'
import cson from 'cson-parser'
import Papa from 'babyparse'
import rf from 'rimraf'
import glob from 'glob'

// my modules
import transformers from './modules/transformers'

// make sure we're using the latest underscore methods
Object.assign(_, underscore)

const log = console.log,
  logE = _.compose(log, c.bgRed.inverse),
  logS = _.compose(log, c.green),
  logI = _.compose(log, c.yellow),
  nodeArgs = process.argv.slice(2),
  fileTypes = ['css', 'opf', 'html', 'xhtml'],
  csv = glob.sync('*.csv')[0],
  config = cson.parse(fs.readFileSync('config.cson', 'utf8')),
  srcFilePath = nodeArgs.length ? nodeArgs[0] : glob.sync('*.epub')[0],
  srcFileName = nodeArgs.length
    ? srcFilePath.substr(srcFilePath.lastIndexOf('/') + 1)
    : srcFilePath,
  fileNameNoExt = srcFileName.replace('.epub', ''),
  getConfigMetadata = _.hasPath(config, `metadata.${fileNameNoExt}`)
    ? config.metadata[fileNameNoExt]
    : {},
  metadata = csv
    ? _.extend(
        Papa.parse(fs.readFileSync(csv, 'utf8'), {
          header: true,
        }).data[0],
        getConfigMetadata
      )
    : getConfigMetadata

// export user configuration for use by transformers
export {metadata, config, srcFilePath}

// add regexes method to each filetype's transformers object
fileTypes.forEach(
  ft =>
    ft !== 'xhtml' &&
    Object.assign(transformers[ft], {
      regexes: doc => {
        var res = doc
        if (config.regexes && config.regexes[ft] && config.regexes[ft].length) {
          for (let i = 0, l = config.regexes[ft].length; i < l; i++) {
            const reg = config.regexes[ft][i],
              regFind = new RegExp(reg.find, 'g')

            log(regFind, reg.replace)

            res = res.replace(regFind, reg.replace)
          }
        }
        return res
      },
    })
)

// TODO 'ignore' property in config.json
// to choose which transformers to use (default all)

function setUpTransformers(keyStr) {
  return _.pipeline(_.values(transformers[keyStr]))
}

const edit = _.object(
  fileTypes.map(
    ft =>
      ft === 'xhtml'
        ? ['xhtml', setUpTransformers('html')]
        : [ft, setUpTransformers(ft)]
  )
)

// processing begins here -->
fs
  .createReadStream(srcFilePath)
  // unzip the epub
  .pipe(unzip.Parse())
  // every time we get an unzipped file, work on it
  .on('entry', entry => {
    const filePath = entry.path,
      fileEnding = filePath.substring(filePath.lastIndexOf('.') + 1),
      folderSep = filePath.includes('/') ? '/' : '\\',
      fileDir = filePath
        .substr(0, filePath.length - fileEnding.length)
        .substring(0, filePath.lastIndexOf(folderSep) + 1),
      run = entry =>
        new Promise((resolve, reject) => {
          var content = ''
          entry.setEncoding('utf8')
          entry
            .on('data', data => {
              content += data
            })
            .on('end', () => {
              if (edit[fileEnding]) resolve(edit[fileEnding](content))
              else resolve(content)
            })
        })

    if (fileEnding === 'png' || fileEnding === 'jpg' || fileEnding === 'jpeg') {
      mkd('out/' + fileDir, err => {
        if (!err) {
          entry
            .pipe(fs.createWriteStream('out/' + filePath))
            .on('close', () => {
              logI('Not processed: ' + filePath)
            })
            .on('error', logE)
        } else logE(err)
      })
    } else {
      run(entry)
        .then(res => {
          mkd('out/' + fileDir, err => {
            if (!err) {
              let w = fs.createWriteStream('out/' + filePath)
              w
                .on('open', () => {
                  w.write(res)
                  logS('Processed ' + filePath)
                })
                .on('error', logE)
            } else log(err)
          })
        })
        .catch(log)
    }
  })

// closing up
process.on('exit', () => {
  try {
    let epub = zip('./out')
    try {
      fs.renameSync(srcFileName, 'old-' + srcFileName)
    } catch (e) {
      if (!nodeArgs.length) {
        logI('')
        logI(e)
      }
    }
    fs.writeFileSync(srcFileName, epub)

    try {
      rf.sync('./out/META-INF')
      rf.sync('./out/OEBPS')
      rf.sync('./out')
    } catch (e) {
      logE(e)
    }

    logS('')
    logS(`::: Completed in ${process.uptime()} seconds! :::`)
  } catch (e) {
    logE(e)
  }
})
