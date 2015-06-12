// node modules
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

var _underscore = require('underscore');

var _underscore2 = _interopRequireDefault(_underscore);

var _underscoreContrib = require('underscore-contrib');

var _underscoreContrib2 = _interopRequireDefault(_underscoreContrib);

var _chalk = require('chalk');

var _chalk2 = _interopRequireDefault(_chalk);

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _mkdirp = require('mkdirp');

var _mkdirp2 = _interopRequireDefault(_mkdirp);

var _unzip = require('unzip');

var _unzip2 = _interopRequireDefault(_unzip);

// import Promise from 'bluebird';

var _resumer = require('resumer');

var _resumer2 = _interopRequireDefault(_resumer);

var _epubZip = require('epub-zip');

var _epubZip2 = _interopRequireDefault(_epubZip);

var _csonParser = require('cson-parser');

var _csonParser2 = _interopRequireDefault(_csonParser);

var _babyparse = require('babyparse');

var _babyparse2 = _interopRequireDefault(_babyparse);

var _rimraf = require('rimraf');

var _rimraf2 = _interopRequireDefault(_rimraf);

var _glob = require('glob');

var _glob2 = _interopRequireDefault(_glob);

require('babel/register');

// my modules

var _modulesTransformers = require('./modules/transformers');

var _modulesTransformers2 = _interopRequireDefault(_modulesTransformers);

// make sure we're using the latest underscore methods
Object.assign(_underscoreContrib2['default'], _underscore2['default']);

var log = console.log,
    logE = _underscoreContrib2['default'].compose(log, _chalk2['default'].bgRed.inverse),
    logS = _underscoreContrib2['default'].compose(log, _chalk2['default'].green),
    nodeArgs = process.argv.slice(2),
    fileTypes = ['css', 'opf', 'html', 'xhtml'],
    csv = _glob2['default'].sync('*.csv')[0],
    config = _csonParser2['default'].parse(_fs2['default'].readFileSync('config.cson', 'utf8')),
    metadata = csv ? Object.assign(_babyparse2['default'].parse(_fs2['default'].readFileSync(csv, 'utf8'), {
  header: true
}).data[0], config.metadata) : config.metadata,
    srcFilePath = nodeArgs.length ? nodeArgs[0] : _glob2['default'].sync('*.epub')[0],
    srcFileName = nodeArgs.length ? srcFilePath.substr(srcFilePath.lastIndexOf('/') + 1) : srcFilePath;

exports.metadata = metadata;
exports.config = config;

log(typeof _modulesTransformers2['default']);
log(JSON.stringify(_modulesTransformers2['default']));

fileTypes.forEach(function (ft) {
  return ft !== 'xhtml' && Object.assign(_modulesTransformers2['default'][ft], {
    regexes: function regexes(doc) {
      var res = doc;
      if (config.regexes && config.regexes[ft] && config.regexes[ft].length) {
        for (var i = 0, l = config.regexes[ft].length; i < l; i++) {
          var reg = config.regexes[ft][i],
              regFind = new RegExp(reg.find, 'g');

          log(regFind, reg.replace);

          res = res.replace(regFind, reg.replace);
        }
      }
      return res;
    }
  });
});

// TODO 'ignore' property in config.json
// to choose which transformers to use (default all)

function setUpTransformers(keyStr) {
  return _underscoreContrib2['default'].pipeline(_underscoreContrib2['default'].values(_modulesTransformers2['default'][keyStr]));
}

var edit = _underscoreContrib2['default'].object(fileTypes.map(function (ft) {
  return ft === 'xhtml' ? ['xhtml', setUpTransformers('html')] : [ft, setUpTransformers(ft)];
}));

// processing begins here -->
_fs2['default'].createReadStream(srcFilePath)

// unzip the epub
.pipe(_unzip2['default'].Parse())

// every time we get an unzipped file, work on it
.on('entry', function (entry) {

  var filePath = entry.path,
      fileEnding = filePath.substring(filePath.lastIndexOf('.') + 1),
      folderSep = filePath.includes('/') ? '/' : '\\',
      fileDir = filePath.substr(0, filePath.length - fileEnding.length).substring(0, filePath.lastIndexOf(folderSep) + 1),
      run = function run(entry) {
    return new Promise(function (resolve, reject) {
      var content = '';
      entry.setEncoding('utf8');
      entry.on('data', function (data) {
        content += data;
      }).on('end', function () {
        if (edit[fileEnding]) resolve(edit[fileEnding](content));else resolve(content);
      });
    });
  };

  if (fileEnding === 'png' || fileEnding === 'jpg' || fileEnding === 'jpeg') {
    (0, _mkdirp2['default'])('out/' + fileDir, function (err) {
      if (!err) {
        entry.pipe(_fs2['default'].createWriteStream('out/' + filePath)).on('close', function () {
          log(_chalk2['default'].yellow('Not processed: ' + filePath));
        }).on('error', logE);
      } else logE(err);
    });
  } else {
    run(entry).then(function (res) {
      (0, _mkdirp2['default'])('out/' + fileDir, function (err) {
        if (!err) {
          (function () {
            var w = _fs2['default'].createWriteStream('out/' + filePath);
            w.on('open', function () {
              w.write(res);
              logS('Processed ' + filePath);
            }).on('error', logE);
          })();
        } else log(err);
      });
    })['catch'](log);
  }
});

// closing up
process.on('exit', function () {
  try {
    var epub = (0, _epubZip2['default'])('./out');
    try {
      _fs2['default'].renameSync(srcFileName, 'old-' + srcFileName);
    } catch (e) {
      logE(e);
    }
    _fs2['default'].writeFileSync(srcFileName, epub);

    // if (nodeArgs[0] !== '-debug') {
    //   rf.sync("./out/META-INF", logE);
    //   rf.sync("./out/OEBPS", logE);
    //   rf.sync("./out", logE);
    // }

    logS('::: Completed in ' + process.uptime() + ' seconds! :::');
  } catch (e) {
    logE(e);
  }
});
