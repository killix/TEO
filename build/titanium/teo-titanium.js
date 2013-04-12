(function(){var require = function (file, cwd) {
    var resolved = require.resolve(file, cwd || '/');
    var mod = require.modules[resolved];
    if (!mod) throw new Error(
        'Failed to resolve module ' + file + ', tried ' + resolved
    );
    var cached = require.cache[resolved];
    var res = cached? cached.exports : mod();
    return res;
};

require.paths = [];
require.modules = {};
require.cache = {};
require.extensions = [".js",".coffee",".json"];

require._core = {
    'assert': true,
    'events': true,
    'fs': true,
    'path': true,
    'vm': true
};

require.resolve = (function () {
    return function (x, cwd) {
        if (!cwd) cwd = '/';
        
        if (require._core[x]) return x;
        var path = require.modules.path();
        cwd = path.resolve('/', cwd);
        var y = cwd || '/';
        
        if (x.match(/^(?:\.\.?\/|\/)/)) {
            var m = loadAsFileSync(path.resolve(y, x))
                || loadAsDirectorySync(path.resolve(y, x));
            if (m) return m;
        }
        
        var n = loadNodeModulesSync(x, y);
        if (n) return n;
        
        throw new Error("Cannot find module '" + x + "'");
        
        function loadAsFileSync (x) {
            x = path.normalize(x);
            if (require.modules[x]) {
                return x;
            }
            
            for (var i = 0; i < require.extensions.length; i++) {
                var ext = require.extensions[i];
                if (require.modules[x + ext]) return x + ext;
            }
        }
        
        function loadAsDirectorySync (x) {
            x = x.replace(/\/+$/, '');
            var pkgfile = path.normalize(x + '/package.json');
            if (require.modules[pkgfile]) {
                var pkg = require.modules[pkgfile]();
                var b = pkg.browserify;
                if (typeof b === 'object' && b.main) {
                    var m = loadAsFileSync(path.resolve(x, b.main));
                    if (m) return m;
                }
                else if (typeof b === 'string') {
                    var m = loadAsFileSync(path.resolve(x, b));
                    if (m) return m;
                }
                else if (pkg.main) {
                    var m = loadAsFileSync(path.resolve(x, pkg.main));
                    if (m) return m;
                }
            }
            
            return loadAsFileSync(x + '/index');
        }
        
        function loadNodeModulesSync (x, start) {
            var dirs = nodeModulesPathsSync(start);
            for (var i = 0; i < dirs.length; i++) {
                var dir = dirs[i];
                var m = loadAsFileSync(dir + '/' + x);
                if (m) return m;
                var n = loadAsDirectorySync(dir + '/' + x);
                if (n) return n;
            }
            
            var m = loadAsFileSync(x);
            if (m) return m;
        }
        
        function nodeModulesPathsSync (start) {
            var parts;
            if (start === '/') parts = [ '' ];
            else parts = path.normalize(start).split('/');
            
            var dirs = [];
            for (var i = parts.length - 1; i >= 0; i--) {
                if (parts[i] === 'node_modules') continue;
                var dir = parts.slice(0, i + 1).join('/') + '/node_modules';
                dirs.push(dir);
            }
            
            return dirs;
        }
    };
})();

require.alias = function (from, to) {
    var path = require.modules.path();
    var res = null;
    try {
        res = require.resolve(from + '/package.json', '/');
    }
    catch (err) {
        res = require.resolve(from, '/');
    }
    var basedir = path.dirname(res);
    
    var keys = (Object.keys || function (obj) {
        var res = [];
        for (var key in obj) res.push(key);
        return res;
    })(require.modules);
    
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        if (key.slice(0, basedir.length + 1) === basedir + '/') {
            var f = key.slice(basedir.length);
            require.modules[to + f] = require.modules[basedir + f];
        }
        else if (key === basedir) {
            require.modules[to] = require.modules[basedir];
        }
    }
};

(function () {
    var process = {};
    var global = typeof window !== 'undefined' ? window : {};
    var definedProcess = false;
    
    require.define = function (filename, fn) {
        if (!definedProcess && require.modules.__browserify_process) {
            process = require.modules.__browserify_process();
            definedProcess = true;
        }
        
        var dirname = require._core[filename]
            ? ''
            : require.modules.path().dirname(filename)
        ;
        
        var require_ = function (file) {
            var requiredModule = require(file, dirname);
            var cached = require.cache[require.resolve(file, dirname)];

            if (cached && cached.parent === null) {
                cached.parent = module_;
            }

            return requiredModule;
        };
        require_.resolve = function (name) {
            return require.resolve(name, dirname);
        };
        require_.modules = require.modules;
        require_.define = require.define;
        require_.cache = require.cache;
        var module_ = {
            id : filename,
            filename: filename,
            exports : {},
            loaded : false,
            parent: null
        };
        
        require.modules[filename] = function () {
            require.cache[filename] = module_;
            fn.call(
                module_.exports,
                require_,
                module_,
                module_.exports,
                dirname,
                filename,
                process,
                global
            );
            module_.loaded = true;
            return module_.exports;
        };
    };
})();


require.define("path",function(require,module,exports,__dirname,__filename,process,global){function filter (xs, fn) {
    var res = [];
    for (var i = 0; i < xs.length; i++) {
        if (fn(xs[i], i, xs)) res.push(xs[i]);
    }
    return res;
}

// resolves . and .. elements in a path array with directory names there
// must be no slashes, empty elements, or device names (c:\) in the array
// (so also no leading and trailing slashes - it does not distinguish
// relative and absolute paths)
function normalizeArray(parts, allowAboveRoot) {
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = parts.length; i >= 0; i--) {
    var last = parts[i];
    if (last == '.') {
      parts.splice(i, 1);
    } else if (last === '..') {
      parts.splice(i, 1);
      up++;
    } else if (up) {
      parts.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (allowAboveRoot) {
    for (; up--; up) {
      parts.unshift('..');
    }
  }

  return parts;
}

// Regex to split a filename into [*, dir, basename, ext]
// posix version
var splitPathRe = /^(.+\/(?!$)|\/)?((?:.+?)?(\.[^.]*)?)$/;

// path.resolve([from ...], to)
// posix version
exports.resolve = function() {
var resolvedPath = '',
    resolvedAbsolute = false;

for (var i = arguments.length; i >= -1 && !resolvedAbsolute; i--) {
  var path = (i >= 0)
      ? arguments[i]
      : process.cwd();

  // Skip empty and invalid entries
  if (typeof path !== 'string' || !path) {
    continue;
  }

  resolvedPath = path + '/' + resolvedPath;
  resolvedAbsolute = path.charAt(0) === '/';
}

// At this point the path should be resolved to a full absolute path, but
// handle relative paths to be safe (might happen when process.cwd() fails)

// Normalize the path
resolvedPath = normalizeArray(filter(resolvedPath.split('/'), function(p) {
    return !!p;
  }), !resolvedAbsolute).join('/');

  return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
};

// path.normalize(path)
// posix version
exports.normalize = function(path) {
var isAbsolute = path.charAt(0) === '/',
    trailingSlash = path.slice(-1) === '/';

// Normalize the path
path = normalizeArray(filter(path.split('/'), function(p) {
    return !!p;
  }), !isAbsolute).join('/');

  if (!path && !isAbsolute) {
    path = '.';
  }
  if (path && trailingSlash) {
    path += '/';
  }
  
  return (isAbsolute ? '/' : '') + path;
};


// posix version
exports.join = function() {
  var paths = Array.prototype.slice.call(arguments, 0);
  return exports.normalize(filter(paths, function(p, index) {
    return p && typeof p === 'string';
  }).join('/'));
};


exports.dirname = function(path) {
  var dir = splitPathRe.exec(path)[1] || '';
  var isWindows = false;
  if (!dir) {
    // No dirname
    return '.';
  } else if (dir.length === 1 ||
      (isWindows && dir.length <= 3 && dir.charAt(1) === ':')) {
    // It is just a slash or a drive letter with a slash
    return dir;
  } else {
    // It is a full dirname, strip trailing slash
    return dir.substring(0, dir.length - 1);
  }
};


exports.basename = function(path, ext) {
  var f = splitPathRe.exec(path)[2] || '';
  // TODO: make this comparison case-insensitive on windows?
  if (ext && f.substr(-1 * ext.length) === ext) {
    f = f.substr(0, f.length - ext.length);
  }
  return f;
};


exports.extname = function(path) {
  return splitPathRe.exec(path)[3] || '';
};

exports.relative = function(from, to) {
  from = exports.resolve(from).substr(1);
  to = exports.resolve(to).substr(1);

  function trim(arr) {
    var start = 0;
    for (; start < arr.length; start++) {
      if (arr[start] !== '') break;
    }

    var end = arr.length - 1;
    for (; end >= 0; end--) {
      if (arr[end] !== '') break;
    }

    if (start > end) return [];
    return arr.slice(start, end - start + 1);
  }

  var fromParts = trim(from.split('/'));
  var toParts = trim(to.split('/'));

  var length = Math.min(fromParts.length, toParts.length);
  var samePartsLength = length;
  for (var i = 0; i < length; i++) {
    if (fromParts[i] !== toParts[i]) {
      samePartsLength = i;
      break;
    }
  }

  var outputParts = [];
  for (var i = samePartsLength; i < fromParts.length; i++) {
    outputParts.push('..');
  }

  outputParts = outputParts.concat(toParts.slice(samePartsLength));

  return outputParts.join('/');
};

});

require.define("__browserify_process",function(require,module,exports,__dirname,__filename,process,global){var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
        && window.setImmediate;
    var canPost = typeof window !== 'undefined'
        && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            if (ev.source === window && ev.data === 'browserify-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('browserify-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.stdout = {write:function(x){console.log(x)}};
process.stderr = {write:function(x){console.error(x)}};
process.exit = function(){}

process.binding = function (name) {
    if (name === 'evals') return (require)('vm')
    else throw new Error('No such module. (Possibly not yet loaded)')
};

(function () {
    var cwd = '/';
    var path;
    process.cwd = function () { return cwd };
    process.chdir = function (dir) {
        if (!path) path = require('path');
        cwd = path.resolve(dir, cwd);
    };
})();

});

require.define("async",function(require,module,exports,__dirname,__filename,process,global){/*
Copyright (c) 2010 Caolan McMahon

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

/*global setTimeout: false, console: false */
(function () {

    var async = {};

    // global on the server, window in the browser
    var root = this,
        previous_async = root.async;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = async;
    }
    else {
        root.async = async;
    }

    async.noConflict = function () {
        root.async = previous_async;
        return async;
    };

    //// cross-browser compatiblity functions ////

    var _forEach = function (arr, iterator) {
        if (arr.forEach) {
            return arr.forEach(iterator);
        }
        for (var i = 0; i < arr.length; i += 1) {
            iterator(arr[i], i, arr);
        }
    };

    var _map = function (arr, iterator) {
        if (arr.map) {
            return arr.map(iterator);
        }
        var results = [];
        _forEach(arr, function (x, i, a) {
            results.push(iterator(x, i, a));
        });
        return results;
    };

    var _reduce = function (arr, iterator, memo) {
        if (arr.reduce) {
            return arr.reduce(iterator, memo);
        }
        _forEach(arr, function (x, i, a) {
            memo = iterator(memo, x, i, a);
        });
        return memo;
    };

    var _keys = function (obj) {
        if (Object.keys) {
            return Object.keys(obj);
        }
        var keys = [];
        for (var k in obj) {
            if (obj.hasOwnProperty(k)) {
                keys.push(k);
            }
        }
        return keys;
    };

    //// exported async module functions ////

    //// nextTick implementation with browser-compatible fallback ////
    if (typeof process === 'undefined' || !(process.nextTick)) {
        async.nextTick = function (fn) {
            setTimeout(fn, 0);
        };
    }
    else {
        async.nextTick = process.nextTick;
    }

    async.forEach = function (arr, iterator, callback) {
        callback = callback || function () {};
        if (!arr.length) {
            return callback();
        }
        var completed = 0;
        _forEach(arr, function (x) {
            iterator(x, function (err) {
                if (err) {
                    callback(err);
                    callback = function () {};
                }
                else {
                    completed += 1;
                    if (completed === arr.length) {
                        callback();
                    }
                }
            });
        });
    };

    async.forEachSeries = function (arr, iterator, callback) {
        callback = callback || function () {};
        if (!arr.length) {
            return callback();
        }
        var completed = 0;
        var iterate = function () {
            iterator(arr[completed], function (err) {
                if (err) {
                    callback(err);
                    callback = function () {};
                }
                else {
                    completed += 1;
                    if (completed === arr.length) {
                        callback();
                    }
                    else {
                        iterate();
                    }
                }
            });
        };
        iterate();
    };
    
    async.forEachLimit = function (arr, limit, iterator, callback) {
        callback = callback || function () {};
        if (!arr.length || limit <= 0) {
            return callback(); 
        }
        var completed = 0;
        var started = 0;
        var running = 0;
        
        (function replenish () {
          if (completed === arr.length) {
              return callback();
          }
          
          while (running < limit && started < arr.length) {
            iterator(arr[started], function (err) {
              if (err) {
                  callback(err);
                  callback = function () {};
              }
              else {
                  completed += 1;
                  running -= 1;
                  if (completed === arr.length) {
                      callback();
                  }
                  else {
                      replenish();
                  }
              }
            });
            started += 1;
            running += 1;
          }
        })();
    };


    var doParallel = function (fn) {
        return function () {
            var args = Array.prototype.slice.call(arguments);
            return fn.apply(null, [async.forEach].concat(args));
        };
    };
    var doSeries = function (fn) {
        return function () {
            var args = Array.prototype.slice.call(arguments);
            return fn.apply(null, [async.forEachSeries].concat(args));
        };
    };


    var _asyncMap = function (eachfn, arr, iterator, callback) {
        var results = [];
        arr = _map(arr, function (x, i) {
            return {index: i, value: x};
        });
        eachfn(arr, function (x, callback) {
            iterator(x.value, function (err, v) {
                results[x.index] = v;
                callback(err);
            });
        }, function (err) {
            callback(err, results);
        });
    };
    async.map = doParallel(_asyncMap);
    async.mapSeries = doSeries(_asyncMap);


    // reduce only has a series version, as doing reduce in parallel won't
    // work in many situations.
    async.reduce = function (arr, memo, iterator, callback) {
        async.forEachSeries(arr, function (x, callback) {
            iterator(memo, x, function (err, v) {
                memo = v;
                callback(err);
            });
        }, function (err) {
            callback(err, memo);
        });
    };
    // inject alias
    async.inject = async.reduce;
    // foldl alias
    async.foldl = async.reduce;

    async.reduceRight = function (arr, memo, iterator, callback) {
        var reversed = _map(arr, function (x) {
            return x;
        }).reverse();
        async.reduce(reversed, memo, iterator, callback);
    };
    // foldr alias
    async.foldr = async.reduceRight;

    var _filter = function (eachfn, arr, iterator, callback) {
        var results = [];
        arr = _map(arr, function (x, i) {
            return {index: i, value: x};
        });
        eachfn(arr, function (x, callback) {
            iterator(x.value, function (v) {
                if (v) {
                    results.push(x);
                }
                callback();
            });
        }, function (err) {
            callback(_map(results.sort(function (a, b) {
                return a.index - b.index;
            }), function (x) {
                return x.value;
            }));
        });
    };
    async.filter = doParallel(_filter);
    async.filterSeries = doSeries(_filter);
    // select alias
    async.select = async.filter;
    async.selectSeries = async.filterSeries;

    var _reject = function (eachfn, arr, iterator, callback) {
        var results = [];
        arr = _map(arr, function (x, i) {
            return {index: i, value: x};
        });
        eachfn(arr, function (x, callback) {
            iterator(x.value, function (v) {
                if (!v) {
                    results.push(x);
                }
                callback();
            });
        }, function (err) {
            callback(_map(results.sort(function (a, b) {
                return a.index - b.index;
            }), function (x) {
                return x.value;
            }));
        });
    };
    async.reject = doParallel(_reject);
    async.rejectSeries = doSeries(_reject);

    var _detect = function (eachfn, arr, iterator, main_callback) {
        eachfn(arr, function (x, callback) {
            iterator(x, function (result) {
                if (result) {
                    main_callback(x);
                    main_callback = function () {};
                }
                else {
                    callback();
                }
            });
        }, function (err) {
            main_callback();
        });
    };
    async.detect = doParallel(_detect);
    async.detectSeries = doSeries(_detect);

    async.some = function (arr, iterator, main_callback) {
        async.forEach(arr, function (x, callback) {
            iterator(x, function (v) {
                if (v) {
                    main_callback(true);
                    main_callback = function () {};
                }
                callback();
            });
        }, function (err) {
            main_callback(false);
        });
    };
    // any alias
    async.any = async.some;

    async.every = function (arr, iterator, main_callback) {
        async.forEach(arr, function (x, callback) {
            iterator(x, function (v) {
                if (!v) {
                    main_callback(false);
                    main_callback = function () {};
                }
                callback();
            });
        }, function (err) {
            main_callback(true);
        });
    };
    // all alias
    async.all = async.every;

    async.sortBy = function (arr, iterator, callback) {
        async.map(arr, function (x, callback) {
            iterator(x, function (err, criteria) {
                if (err) {
                    callback(err);
                }
                else {
                    callback(null, {value: x, criteria: criteria});
                }
            });
        }, function (err, results) {
            if (err) {
                return callback(err);
            }
            else {
                var fn = function (left, right) {
                    var a = left.criteria, b = right.criteria;
                    return a < b ? -1 : a > b ? 1 : 0;
                };
                callback(null, _map(results.sort(fn), function (x) {
                    return x.value;
                }));
            }
        });
    };

    async.auto = function (tasks, callback) {
        callback = callback || function () {};
        var keys = _keys(tasks);
        if (!keys.length) {
            return callback(null);
        }

        var results = {};

        var listeners = [];
        var addListener = function (fn) {
            listeners.unshift(fn);
        };
        var removeListener = function (fn) {
            for (var i = 0; i < listeners.length; i += 1) {
                if (listeners[i] === fn) {
                    listeners.splice(i, 1);
                    return;
                }
            }
        };
        var taskComplete = function () {
            _forEach(listeners.slice(0), function (fn) {
                fn();
            });
        };

        addListener(function () {
            if (_keys(results).length === keys.length) {
                callback(null, results);
                callback = function () {};
            }
        });

        _forEach(keys, function (k) {
            var task = (tasks[k] instanceof Function) ? [tasks[k]]: tasks[k];
            var taskCallback = function (err) {
                if (err) {
                    callback(err);
                    // stop subsequent errors hitting callback multiple times
                    callback = function () {};
                }
                else {
                    var args = Array.prototype.slice.call(arguments, 1);
                    if (args.length <= 1) {
                        args = args[0];
                    }
                    results[k] = args;
                    taskComplete();
                }
            };
            var requires = task.slice(0, Math.abs(task.length - 1)) || [];
            var ready = function () {
                return _reduce(requires, function (a, x) {
                    return (a && results.hasOwnProperty(x));
                }, true);
            };
            if (ready()) {
                task[task.length - 1](taskCallback, results);
            }
            else {
                var listener = function () {
                    if (ready()) {
                        removeListener(listener);
                        task[task.length - 1](taskCallback, results);
                    }
                };
                addListener(listener);
            }
        });
    };

    async.waterfall = function (tasks, callback) {
        callback = callback || function () {};
        if (!tasks.length) {
            return callback();
        }
        var wrapIterator = function (iterator) {
            return function (err) {
                if (err) {
                    callback(err);
                    callback = function () {};
                }
                else {
                    var args = Array.prototype.slice.call(arguments, 1);
                    var next = iterator.next();
                    if (next) {
                        args.push(wrapIterator(next));
                    }
                    else {
                        args.push(callback);
                    }
                    async.nextTick(function () {
                        iterator.apply(null, args);
                    });
                }
            };
        };
        wrapIterator(async.iterator(tasks))();
    };

    async.parallel = function (tasks, callback) {
        callback = callback || function () {};
        if (tasks.constructor === Array) {
            async.map(tasks, function (fn, callback) {
                if (fn) {
                    fn(function (err) {
                        var args = Array.prototype.slice.call(arguments, 1);
                        if (args.length <= 1) {
                            args = args[0];
                        }
                        callback.call(null, err, args);
                    });
                }
            }, callback);
        }
        else {
            var results = {};
            async.forEach(_keys(tasks), function (k, callback) {
                tasks[k](function (err) {
                    var args = Array.prototype.slice.call(arguments, 1);
                    if (args.length <= 1) {
                        args = args[0];
                    }
                    results[k] = args;
                    callback(err);
                });
            }, function (err) {
                callback(err, results);
            });
        }
    };

    async.series = function (tasks, callback) {
        callback = callback || function () {};
        if (tasks.constructor === Array) {
            async.mapSeries(tasks, function (fn, callback) {
                if (fn) {
                    fn(function (err) {
                        var args = Array.prototype.slice.call(arguments, 1);
                        if (args.length <= 1) {
                            args = args[0];
                        }
                        callback.call(null, err, args);
                    });
                }
            }, callback);
        }
        else {
            var results = {};
            async.forEachSeries(_keys(tasks), function (k, callback) {
                tasks[k](function (err) {
                    var args = Array.prototype.slice.call(arguments, 1);
                    if (args.length <= 1) {
                        args = args[0];
                    }
                    results[k] = args;
                    callback(err);
                });
            }, function (err) {
                callback(err, results);
            });
        }
    };

    async.iterator = function (tasks) {
        var makeCallback = function (index) {
            var fn = function () {
                if (tasks.length) {
                    tasks[index].apply(null, arguments);
                }
                return fn.next();
            };
            fn.next = function () {
                return (index < tasks.length - 1) ? makeCallback(index + 1): null;
            };
            return fn;
        };
        return makeCallback(0);
    };

    async.apply = function (fn) {
        var args = Array.prototype.slice.call(arguments, 1);
        return function () {
            return fn.apply(
                null, args.concat(Array.prototype.slice.call(arguments))
            );
        };
    };

    var _concat = function (eachfn, arr, fn, callback) {
        var r = [];
        eachfn(arr, function (x, cb) {
            fn(x, function (err, y) {
                r = r.concat(y || []);
                cb(err);
            });
        }, function (err) {
            callback(err, r);
        });
    };
    async.concat = doParallel(_concat);
    async.concatSeries = doSeries(_concat);

    async.whilst = function (test, iterator, callback) {
        if (test()) {
            iterator(function (err) {
                if (err) {
                    return callback(err);
                }
                async.whilst(test, iterator, callback);
            });
        }
        else {
            callback();
        }
    };

    async.until = function (test, iterator, callback) {
        if (!test()) {
            iterator(function (err) {
                if (err) {
                    return callback(err);
                }
                async.until(test, iterator, callback);
            });
        }
        else {
            callback();
        }
    };

    async.queue = function (worker, concurrency) {
        var workers = 0;
        var q = {
            tasks: [],
            concurrency: concurrency,
            saturated: null,
            empty: null,
            drain: null,
            push: function (data, callback) {
                if(data.constructor !== Array) {
                    data = [data];
                }
                _forEach(data, function(task) {
                    q.tasks.push({
                        data: task,
                        callback: typeof callback === 'function' ? callback : null
                    });
                    if (q.saturated && q.tasks.length == concurrency) {
                        q.saturated();
                    }
                    async.nextTick(q.process);
                });
            },
            process: function () {
                if (workers < q.concurrency && q.tasks.length) {
                    var task = q.tasks.shift();
                    if(q.empty && q.tasks.length == 0) q.empty();
                    workers += 1;
                    worker(task.data, function () {
                        workers -= 1;
                        if (task.callback) {
                            task.callback.apply(task, arguments);
                        }
                        if(q.drain && q.tasks.length + workers == 0) q.drain();
                        q.process();
                    });
                }
            },
            length: function () {
                return q.tasks.length;
            },
            running: function () {
                return workers;
            }
        };
        return q;
    };

    var _console_fn = function (name) {
        return function (fn) {
            var args = Array.prototype.slice.call(arguments, 1);
            fn.apply(null, args.concat([function (err) {
                var args = Array.prototype.slice.call(arguments, 1);
                if (typeof console !== 'undefined') {
                    if (err) {
                        if (console.error) {
                            console.error(err);
                        }
                    }
                    else if (console[name]) {
                        _forEach(args, function (x) {
                            console[name](x);
                        });
                    }
                }
            }]));
        };
    };
    async.log = _console_fn('log');
    async.dir = _console_fn('dir');
    /*async.info = _console_fn('info');
    async.warn = _console_fn('warn');
    async.error = _console_fn('error');*/

    async.memoize = function (fn, hasher) {
        var memo = {};
        var queues = {};
        hasher = hasher || function (x) {
            return x;
        };
        var memoized = function () {
            var args = Array.prototype.slice.call(arguments);
            var callback = args.pop();
            var key = hasher.apply(null, args);
            if (key in memo) {
                callback.apply(null, memo[key]);
            }
            else if (key in queues) {
                queues[key].push(callback);
            }
            else {
                queues[key] = [callback];
                fn.apply(null, args.concat([function () {
                    memo[key] = arguments;
                    var q = queues[key];
                    delete queues[key];
                    for (var i = 0, l = q.length; i < l; i++) {
                      q[i].apply(null, arguments);
                    }
                }]));
            }
        };
        memoized.unmemoized = fn;
        return memoized;
    };

    async.unmemoize = function (fn) {
      return function () {
        return (fn.unmemoized || fn).apply(null, arguments);
      }
    };

}());

});

require.define("seedrandom.js",function(require,module,exports,__dirname,__filename,process,global){;(function () {

  var root = this

  if (typeof exports !== 'undefined') {
    module.exports = SeedRandom
  } else {
    root.SeedRandom = SeedRandom
  }

  function SeedRandom(Math) {
    SR(
      [],   // pool: entropy pool starts empty
      Math, // math: package containing random, pow, and seedrandom
      256,  // width: each RC4 output is 0 <= x < 256
      6,    // chunks: at least six RC4 outputs for each double
      52    // significance: there are 52 significant digits in a double
    )
  }

  // seedrandom.js version 2.0.
  // Author: David Bau 4/2/2011
  //
  // Defines a method Math.seedrandom() that, when called, substitutes
  // an explicitly seeded RC4-based algorithm for Math.random().  Also
  // supports automatic seeding from local or network sources of entropy.
  //
  // Usage:
  //
  //   <script src=http://davidbau.com/encode/seedrandom-min.js></script>
  //
  //   Math.seedrandom('yipee'); Sets Math.random to a function that is
  //                             initialized using the given explicit seed.
  //
  //   Math.seedrandom();        Sets Math.random to a function that is
  //                             seeded using the current time, dom state,
  //                             and other accumulated local entropy.
  //                             The generated seed string is returned.
  //
  //   Math.seedrandom('yowza', true);
  //                             Seeds using the given explicit seed mixed
  //                             together with accumulated entropy.
  //
  //   <script src="http://bit.ly/srandom-512"></script>
  //                             Seeds using physical random bits downloaded
  //                             from random.org.
  //
  //   <script src="https://jsonlib.appspot.com/urandom?callback=Math.seedrandom">
  //   </script>                 Seeds using urandom bits from call.jsonlib.com,
  //                             which is faster than random.org.
  //
  // Examples:
  //
  //   Math.seedrandom("hello");            // Use "hello" as the seed.
  //   document.write(Math.random());       // Always 0.5463663768140734
  //   document.write(Math.random());       // Always 0.43973793770592234
  //   var rng1 = Math.random;              // Remember the current prng.
  //
  //   var autoseed = Math.seedrandom();    // New prng with an automatic seed.
  //   document.write(Math.random());       // Pretty much unpredictable.
  //
  //   Math.random = rng1;                  // Continue "hello" prng sequence.
  //   document.write(Math.random());       // Always 0.554769432473455
  //
  //   Math.seedrandom(autoseed);           // Restart at the previous seed.
  //   document.write(Math.random());       // Repeat the 'unpredictable' value.
  //
  // Notes:
  //
  // Each time seedrandom('arg') is called, entropy from the passed seed
  // is accumulated in a pool to help generate future seeds for the
  // zero-argument form of Math.seedrandom, so entropy can be injected over
  // time by calling seedrandom with explicit data repeatedly.
  //
  // On speed - This javascript implementation of Math.random() is about
  // 3-10x slower than the built-in Math.random() because it is not native
  // code, but this is typically fast enough anyway.  Seeding is more expensive,
  // especially if you use auto-seeding.  Some details (timings on Chrome 4):
  //
  // Our Math.random()            - avg less than 0.002 milliseconds per call
  // seedrandom('explicit')       - avg less than 0.5 milliseconds per call
  // seedrandom('explicit', true) - avg less than 2 milliseconds per call
  // seedrandom()                 - avg about 38 milliseconds per call
  //
  // LICENSE (BSD):
  //
  // Copyright 2010 David Bau, all rights reserved.
  //
  // Redistribution and use in source and binary forms, with or without
  // modification, are permitted provided that the following conditions are met:
  // 
  //   1. Redistributions of source code must retain the above copyright
  //      notice, this list of conditions and the following disclaimer.
  //
  //   2. Redistributions in binary form must reproduce the above copyright
  //      notice, this list of conditions and the following disclaimer in the
  //      documentation and/or other materials provided with the distribution.
  // 
  //   3. Neither the name of this module nor the names of its contributors may
  //      be used to endorse or promote products derived from this software
  //      without specific prior written permission.
  // 
  // THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
  // "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
  // LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
  // A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
  // OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
  // SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
  // LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
  // DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
  // THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
  // (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
  // OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
  //
  /**
   * All code is in an anonymous closure to keep the global namespace clean.
   *
   * @param {number=} overflow 
   * @param {number=} startdenom
   */
  function SR(pool, math, width, chunks, significance, overflow, startdenom) {

  //
  // seedrandom()
  // This is the seedrandom function described above.
  //
  math['seedrandom'] = function seedrandom(seed, use_entropy) {
    var key = [];
    var arc4;

    // Flatten the seed string or build one from local entropy if needed.
    seed = mixkey(flatten(
      use_entropy ? [seed, pool] :
      arguments.length ? seed :
      [new Date().getTime(), pool, root], 3), key);

    // Use the seed to initialize an ARC4 generator.
    arc4 = new ARC4(key);

    // Mix the randomness into accumulated entropy.
    mixkey(arc4.S, pool);

    // Override Math.random

    // This function returns a random double in [0, 1) that contains
    // randomness in every bit of the mantissa of the IEEE 754 value.

    math['random'] = function random() {  // Closure to return a random double:
      var n = arc4.g(chunks);             // Start with a numerator n < 2 ^ 48
      var d = startdenom;                 //   and denominator d = 2 ^ 48.
      var x = 0;                          //   and no 'extra last byte'.
      while (n < significance) {          // Fill up all significant digits by
        n = (n + x) * width;              //   shifting numerator and
        d *= width;                       //   denominator and generating a
        x = arc4.g(1);                    //   new least-significant-byte.
      }
      while (n >= overflow) {             // To avoid rounding up, before adding
        n /= 2;                           //   last byte, shift everything
        d /= 2;                           //   right using integer math until
        x >>>= 1;                         //   we have exactly the desired bits.
      }
      return (n + x) / d;                 // Form the number within [0, 1).
    };

    // Return the seed that was used
    return seed;
  };

  //
  // ARC4
  //
  // An ARC4 implementation.  The constructor takes a key in the form of
  // an array of at most (width) integers that should be 0 <= x < (width).
  //
  // The g(count) method returns a pseudorandom integer that concatenates
  // the next (count) outputs from ARC4.  Its return value is a number x
  // that is in the range 0 <= x < (width ^ count).
  //
  /** @constructor */
  function ARC4(key) {
    var t, u, me = this, keylen = key.length;
    var i = 0, j = me.i = me.j = me.m = 0;
    me.S = [];
    me.c = [];

    // The empty key [] is treated as [0].
    if (!keylen) { key = [keylen++]; }

    // Set up S using the standard key scheduling algorithm.
    while (i < width) { me.S[i] = i++; }
    for (i = 0; i < width; i++) {
      t = me.S[i];
      j = lowbits(j + t + key[i % keylen]);
      u = me.S[j];
      me.S[i] = u;
      me.S[j] = t;
    }

    // The "g" method returns the next (count) outputs as one number.
    me.g = function getnext(count) {
      var s = me.S;
      var i = lowbits(me.i + 1); var t = s[i];
      var j = lowbits(me.j + t); var u = s[j];
      s[i] = u;
      s[j] = t;
      var r = s[lowbits(t + u)];
      while (--count) {
        i = lowbits(i + 1); t = s[i];
        j = lowbits(j + t); u = s[j];
        s[i] = u;
        s[j] = t;
        r = r * width + s[lowbits(t + u)];
      }
      me.i = i;
      me.j = j;
      return r;
    };
    // For robust unpredictability discard an initial batch of values.
    // See http://www.rsa.com/rsalabs/node.asp?id=2009
    me.g(width);
  }

  //
  // flatten()
  // Converts an object tree to nested arrays of strings.
  //
  /** @param {Object=} result 
    * @param {string=} prop
    * @param {string=} typ */
  function flatten(obj, depth, result, prop, typ) {
    result = [];
    typ = typeof(obj);
    if (depth && typ == 'object') {
      for (prop in obj) {
        if (prop.indexOf('S') < 5) {    // Avoid FF3 bug (local/sessionStorage)
          try { result.push(flatten(obj[prop], depth - 1)); } catch (e) {}
        }
      }
    }
    return (result.length ? result : obj + (typ != 'string' ? '\0' : ''));
  }

  //
  // mixkey()
  // Mixes a string seed into a key that is an array of integers, and
  // returns a shortened string seed that is equivalent to the result key.
  //
  /** @param {number=} smear 
    * @param {number=} j */
  function mixkey(seed, key, smear, j) {
    seed += '';                         // Ensure the seed is a string
    smear = 0;
    for (j = 0; j < seed.length; j++) {
      key[lowbits(j)] =
        lowbits((smear ^= key[lowbits(j)] * 19) + seed.charCodeAt(j));
    }
    seed = '';
    for (j in key) { seed += String.fromCharCode(key[j]); }
    return seed;
  }

  //
  // lowbits()
  // A quick "n mod width" for width a power of 2.
  //
  function lowbits(n) { return n & (width - 1); }

  //
  // The following constants are related to IEEE 754 limits.
  //
  startdenom = math.pow(width, chunks);
  significance = math.pow(2, significance);
  overflow = significance * 2;

  //
  // When seedrandom.js is loaded, we immediately mix a few bits
  // from the built-in RNG into the entropy pool.  Because we do
  // not want to intefere with determinstic PRNG state later,
  // seedrandom will not call math.random on its own again after
  // initialization.
  //
  mixkey(math.random(), pool);

  // End anonymous scope, and pass initial values.
  }

}).call(this)
});

require.define("bigint.js",function(require,module,exports,__dirname,__filename,process,global){;(function () {

  var root = this

  var bpe = 0  // bits stored per array element
  for (bpe = 0; (1 << (bpe + 1)) > (1 << bpe); bpe++) ;  // bpe = number of bits in the mantissa on this platform
  bpe >>= 1  // bpe = number of bits in one element of the array representing the bigInt

  var BigInt = {
      str2bigInt    : str2bigInt
    , bigInt2str    : bigInt2str
    , int2bigInt    : int2bigInt
    , multMod       : multMod
    , powMod        : powMod
    , inverseMod    : inverseMod
    , randBigInt    : randBigInt
    , equals        : equals
    , sub           : sub
    , mod           : mod
    , mod_          : mod_
    , modInt        : modInt
    , mult          : mult
    , divInt_       : divInt_
    , rightShift_   : rightShift_
    , leftShift_    : leftShift_
    , dup           : dup
    , greater       : greater
    , add           : add
    , addInt        : addInt
    , addInt_       : addInt_
    , isZero        : isZero
    , bitSize       : bitSize
    , randTruePrime : randTruePrime
    , randProbPrime : randProbPrime
    , millerRabin   : millerRabin
    , divide_       : divide_
    , trim          : trim
    , expand        : expand
    , bpe           : bpe
    , GCD           : GCD
    , equalsInt     : equalsInt
  }

  var SeedRandom = root.SeedRandom
    , crypto = root.crypto

  var buf
  if (typeof require !== 'undefined') {
    module.exports = BigInt
    SeedRandom || (SeedRandom = require('./seedrandom.js'))
    crypto = require('crypto')
    try {
      buf = crypto.randomBytes(1024)
    } catch (e) { throw e }
  } else {
    root.BigInt = BigInt
    if ( (typeof crypto !== 'undefined') &&
         (typeof crypto.getRandomValues === 'function')
    ) {
      buf = new Uint8Array(1024)
      crypto.getRandomValues(buf)
    } else {
      throw new Error('Keys should not be generated without CSPRNG.')
    }
  }

  var i, len, seed = ''
  for (i = 0, len = buf.length; i < len; i++) {
    seed += String.fromCharCode(buf[i])
  }

  SeedRandom(Math)
  Math.seedrandom(seed)
  seed = null

  ////////////////////////////////////////////////////////////////////////////////////////
  // Big Integer Library v. 5.4
  // Created 2000, last modified 2009
  // Leemon Baird
  // www.leemon.com
  //
  // Version history:
  // v 5.4  3 Oct 2009
  //   - added "var i" to greaterShift() so i is not global. (Thanks to Péter Szabó for finding that bug)
  //
  // v 5.3  21 Sep 2009
  //   - added randProbPrime(k) for probable primes
  //   - unrolled loop in mont_ (slightly faster)
  //   - millerRabin now takes a bigInt parameter rather than an int
  //
  // v 5.2  15 Sep 2009
  //   - fixed capitalization in call to int2bigInt in randBigInt
  //     (thanks to Emili Evripidou, Reinhold Behringer, and Samuel Macaleese for finding that bug)
  //
  // v 5.1  8 Oct 2007 
  //   - renamed inverseModInt_ to inverseModInt since it doesn't change its parameters
  //   - added functions GCD and randBigInt, which call GCD_ and randBigInt_
  //   - fixed a bug found by Rob Visser (see comment with his name below)
  //   - improved comments
  //
  // This file is public domain.   You can use it for any purpose without restriction.
  // I do not guarantee that it is correct, so use it at your own risk.  If you use 
  // it for something interesting, I'd appreciate hearing about it.  If you find 
  // any bugs or make any improvements, I'd appreciate hearing about those too.
  // It would also be nice if my name and URL were left in the comments.  But none 
  // of that is required.
  //
  // This code defines a bigInt library for arbitrary-precision integers.
  // A bigInt is an array of integers storing the value in chunks of bpe bits, 
  // little endian (buff[0] is the least significant word).
  // Negative bigInts are stored two's complement.  Almost all the functions treat
  // bigInts as nonnegative.  The few that view them as two's complement say so
  // in their comments.  Some functions assume their parameters have at least one 
  // leading zero element. Functions with an underscore at the end of the name put
  // their answer into one of the arrays passed in, and have unpredictable behavior 
  // in case of overflow, so the caller must make sure the arrays are big enough to 
  // hold the answer.  But the average user should never have to call any of the 
  // underscored functions.  Each important underscored function has a wrapper function 
  // of the same name without the underscore that takes care of the details for you.  
  // For each underscored function where a parameter is modified, that same variable 
  // must not be used as another argument too.  So, you cannot square x by doing 
  // multMod_(x,x,n).  You must use squareMod_(x,n) instead, or do y=dup(x); multMod_(x,y,n).
  // Or simply use the multMod(x,x,n) function without the underscore, where
  // such issues never arise, because non-underscored functions never change
  // their parameters; they always allocate new memory for the answer that is returned.
  //
  // These functions are designed to avoid frequent dynamic memory allocation in the inner loop.
  // For most functions, if it needs a BigInt as a local variable it will actually use
  // a global, and will only allocate to it only when it's not the right size.  This ensures
  // that when a function is called repeatedly with same-sized parameters, it only allocates
  // memory on the first call.
  //
  // Note that for cryptographic purposes, the calls to Math.random() must 
  // be replaced with calls to a better pseudorandom number generator.
  //
  // In the following, "bigInt" means a bigInt with at least one leading zero element,
  // and "integer" means a nonnegative integer less than radix.  In some cases, integer 
  // can be negative.  Negative bigInts are 2s complement.
  // 
  // The following functions do not modify their inputs.
  // Those returning a bigInt, string, or Array will dynamically allocate memory for that value.
  // Those returning a boolean will return the integer 0 (false) or 1 (true).
  // Those returning boolean or int will not allocate memory except possibly on the first 
  // time they're called with a given parameter size.
  // 
  // bigInt  add(x,y)               //return (x+y) for bigInts x and y.  
  // bigInt  addInt(x,n)            //return (x+n) where x is a bigInt and n is an integer.
  // string  bigInt2str(x,base)     //return a string form of bigInt x in a given base, with 2 <= base <= 95
  // int     bitSize(x)             //return how many bits long the bigInt x is, not counting leading zeros
  // bigInt  dup(x)                 //return a copy of bigInt x
  // boolean equals(x,y)            //is the bigInt x equal to the bigint y?
  // boolean equalsInt(x,y)         //is bigint x equal to integer y?
  // bigInt  expand(x,n)            //return a copy of x with at least n elements, adding leading zeros if needed
  // Array   findPrimes(n)          //return array of all primes less than integer n
  // bigInt  GCD(x,y)               //return greatest common divisor of bigInts x and y (each with same number of elements).
  // boolean greater(x,y)           //is x>y?  (x and y are nonnegative bigInts)
  // boolean greaterShift(x,y,shift)//is (x <<(shift*bpe)) > y?
  // bigInt  int2bigInt(t,n,m)      //return a bigInt equal to integer t, with at least n bits and m array elements
  // bigInt  inverseMod(x,n)        //return (x**(-1) mod n) for bigInts x and n.  If no inverse exists, it returns null
  // int     inverseModInt(x,n)     //return x**(-1) mod n, for integers x and n.  Return 0 if there is no inverse
  // boolean isZero(x)              //is the bigInt x equal to zero?
  // boolean millerRabin(x,b)       //does one round of Miller-Rabin base integer b say that bigInt x is possibly prime? (b is bigInt, 1<b<x)
  // boolean millerRabinInt(x,b)    //does one round of Miller-Rabin base integer b say that bigInt x is possibly prime? (b is int,    1<b<x)
  // bigInt  mod(x,n)               //return a new bigInt equal to (x mod n) for bigInts x and n.
  // int     modInt(x,n)            //return x mod n for bigInt x and integer n.
  // bigInt  mult(x,y)              //return x*y for bigInts x and y. This is faster when y<x.
  // bigInt  multMod(x,y,n)         //return (x*y mod n) for bigInts x,y,n.  For greater speed, let y<x.
  // boolean negative(x)            //is bigInt x negative?
  // bigInt  powMod(x,y,n)          //return (x**y mod n) where x,y,n are bigInts and ** is exponentiation.  0**0=1. Faster for odd n.
  // bigInt  randBigInt(n,s)        //return an n-bit random BigInt (n>=1).  If s=1, then the most significant of those n bits is set to 1.
  // bigInt  randTruePrime(k)       //return a new, random, k-bit, true prime bigInt using Maurer's algorithm.
  // bigInt  randProbPrime(k)       //return a new, random, k-bit, probable prime bigInt (probability it's composite less than 2^-80).
  // bigInt  str2bigInt(s,b,n,m)    //return a bigInt for number represented in string s in base b with at least n bits and m array elements
  // bigInt  sub(x,y)               //return (x-y) for bigInts x and y.  Negative answers will be 2s complement
  // bigInt  trim(x,k)              //return a copy of x with exactly k leading zero elements
  //
  //
  // The following functions each have a non-underscored version, which most users should call instead.
  // These functions each write to a single parameter, and the caller is responsible for ensuring the array 
  // passed in is large enough to hold the result. 
  //
  // void    addInt_(x,n)          //do x=x+n where x is a bigInt and n is an integer
  // void    add_(x,y)             //do x=x+y for bigInts x and y
  // void    copy_(x,y)            //do x=y on bigInts x and y
  // void    copyInt_(x,n)         //do x=n on bigInt x and integer n
  // void    GCD_(x,y)             //set x to the greatest common divisor of bigInts x and y, (y is destroyed).  (This never overflows its array).
  // boolean inverseMod_(x,n)      //do x=x**(-1) mod n, for bigInts x and n. Returns 1 (0) if inverse does (doesn't) exist
  // void    mod_(x,n)             //do x=x mod n for bigInts x and n. (This never overflows its array).
  // void    mult_(x,y)            //do x=x*y for bigInts x and y.
  // void    multMod_(x,y,n)       //do x=x*y  mod n for bigInts x,y,n.
  // void    powMod_(x,y,n)        //do x=x**y mod n, where x,y,n are bigInts (n is odd) and ** is exponentiation.  0**0=1.
  // void    randBigInt_(b,n,s)    //do b = an n-bit random BigInt. if s=1, then nth bit (most significant bit) is set to 1. n>=1.
  // void    randTruePrime_(ans,k) //do ans = a random k-bit true random prime (not just probable prime) with 1 in the msb.
  // void    sub_(x,y)             //do x=x-y for bigInts x and y. Negative answers will be 2s complement.
  //
  // The following functions do NOT have a non-underscored version. 
  // They each write a bigInt result to one or more parameters.  The caller is responsible for
  // ensuring the arrays passed in are large enough to hold the results. 
  //
  // void addShift_(x,y,ys)       //do x=x+(y<<(ys*bpe))
  // void carry_(x)               //do carries and borrows so each element of the bigInt x fits in bpe bits.
  // void divide_(x,y,q,r)        //divide x by y giving quotient q and remainder r
  // int  divInt_(x,n)            //do x=floor(x/n) for bigInt x and integer n, and return the remainder. (This never overflows its array).
  // int  eGCD_(x,y,d,a,b)        //sets a,b,d to positive bigInts such that d = GCD_(x,y) = a*x-b*y
  // void halve_(x)               //do x=floor(|x|/2)*sgn(x) for bigInt x in 2's complement.  (This never overflows its array).
  // void leftShift_(x,n)         //left shift bigInt x by n bits.  n<bpe.
  // void linComb_(x,y,a,b)       //do x=a*x+b*y for bigInts x and y and integers a and b
  // void linCombShift_(x,y,b,ys) //do x=x+b*(y<<(ys*bpe)) for bigInts x and y, and integers b and ys
  // void mont_(x,y,n,np)         //Montgomery multiplication (see comments where the function is defined)
  // void multInt_(x,n)           //do x=x*n where x is a bigInt and n is an integer.
  // void rightShift_(x,n)        //right shift bigInt x by n bits.  0 <= n < bpe. (This never overflows its array).
  // void squareMod_(x,n)         //do x=x*x  mod n for bigInts x,n
  // void subShift_(x,y,ys)       //do x=x-(y<<(ys*bpe)). Negative answers will be 2s complement.
  //
  // The following functions are based on algorithms from the _Handbook of Applied Cryptography_
  //    powMod_()           = algorithm 14.94, Montgomery exponentiation
  //    eGCD_,inverseMod_() = algorithm 14.61, Binary extended GCD_
  //    GCD_()              = algorothm 14.57, Lehmer's algorithm
  //    mont_()             = algorithm 14.36, Montgomery multiplication
  //    divide_()           = algorithm 14.20  Multiple-precision division
  //    squareMod_()        = algorithm 14.16  Multiple-precision squaring
  //    randTruePrime_()    = algorithm  4.62, Maurer's algorithm
  //    millerRabin()       = algorithm  4.24, Miller-Rabin algorithm
  //
  // Profiling shows:
  //     randTruePrime_() spends:
  //         10% of its time in calls to powMod_()
  //         85% of its time in calls to millerRabin()
  //     millerRabin() spends:
  //         99% of its time in calls to powMod_()   (always with a base of 2)
  //     powMod_() spends:
  //         94% of its time in calls to mont_()  (almost always with x==y)
  //
  // This suggests there are several ways to speed up this library slightly:
  //     - convert powMod_ to use a Montgomery form of k-ary window (or maybe a Montgomery form of sliding window)
  //         -- this should especially focus on being fast when raising 2 to a power mod n
  //     - convert randTruePrime_() to use a minimum r of 1/3 instead of 1/2 with the appropriate change to the test
  //     - tune the parameters in randTruePrime_(), including c, m, and recLimit
  //     - speed up the single loop in mont_() that takes 95% of the runtime, perhaps by reducing checking
  //       within the loop when all the parameters are the same length.
  //
  // There are several ideas that look like they wouldn't help much at all:
  //     - replacing trial division in randTruePrime_() with a sieve (that speeds up something taking almost no time anyway)
  //     - increase bpe from 15 to 30 (that would help if we had a 32*32->64 multiplier, but not with JavaScript's 32*32->32)
  //     - speeding up mont_(x,y,n,np) when x==y by doing a non-modular, non-Montgomery square
  //       followed by a Montgomery reduction.  The intermediate answer will be twice as long as x, so that
  //       method would be slower.  This is unfortunate because the code currently spends almost all of its time
  //       doing mont_(x,x,...), both for randTruePrime_() and powMod_().  A faster method for Montgomery squaring
  //       would have a large impact on the speed of randTruePrime_() and powMod_().  HAC has a couple of poorly-worded
  //       sentences that seem to imply it's faster to do a non-modular square followed by a single
  //       Montgomery reduction, but that's obviously wrong.
  ////////////////////////////////////////////////////////////////////////////////////////

  //globals
  var mask=0;        //AND this with an array element to chop it down to bpe bits
  var radix=mask+1;  //equals 2^bpe.  A single 1 bit to the left of the last bit of mask.

  //the digits for converting to different bases
  var digitsStr='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_=!@#$%^&*()[]{}|;:,.<>/?`~ \\\'\"+-';

  //initialize the global variables
  mask=(1<<bpe)-1;           //AND the mask with an integer to get its bpe least significant bits
  radix=mask+1;              //2^bpe.  a single 1 bit to the left of the first bit of mask
  var one=int2bigInt(1,1,1);     //constant used in powMod_()

  //the following global variables are scratchpad memory to 
  //reduce dynamic memory allocation in the inner loop
  var t=new Array(0);
  var ss=t;       //used in mult_()
  var s0=t;       //used in multMod_(), squareMod_()
  var s1=t;       //used in powMod_(), multMod_(), squareMod_()
  var s2=t;       //used in powMod_(), multMod_()
  var s3=t;       //used in powMod_()
  var s4=t, s5=t; //used in mod_()
  var s6=t;       //used in bigInt2str()
  var s7=t;       //used in powMod_()
  var T=t;        //used in GCD_()
  var sa=t;       //used in mont_()
  var mr_x1=t, mr_r=t, mr_a=t;                                      //used in millerRabin()
  var eg_v=t, eg_u=t, eg_A=t, eg_B=t, eg_C=t, eg_D=t;               //used in eGCD_(), inverseMod_()
  var md_q1=t, md_q2=t, md_q3=t, md_r=t, md_r1=t, md_r2=t, md_tt=t; //used in mod_()

  var primes=t, pows=t, s_i=t, s_i2=t, s_R=t, s_rm=t, s_q=t, s_n1=t;
  var s_a=t, s_r2=t, s_n=t, s_b=t, s_d=t, s_x1=t, s_x2=t, s_aa=t; //used in randTruePrime_()
    
  var rpprb=t; //used in randProbPrimeRounds() (which also uses "primes")

  ////////////////////////////////////////////////////////////////////////////////////////


  //return array of all primes less than integer n
  function findPrimes(n) {
    var i,s,p,ans;
    s=new Array(n);
    for (i=0;i<n;i++)
      s[i]=0;
    s[0]=2;
    p=0;    //first p elements of s are primes, the rest are a sieve
    for(;s[p]<n;) {                  //s[p] is the pth prime
      for(i=s[p]*s[p]; i<n; i+=s[p]) //mark multiples of s[p]
        s[i]=1;
      p++;
      s[p]=s[p-1]+1;
      for(; s[p]<n && s[s[p]]; s[p]++); //find next prime (where s[p]==0)
    }
    ans=new Array(p);
    for(i=0;i<p;i++)
      ans[i]=s[i];
    return ans;
  }


  //does a single round of Miller-Rabin base b consider x to be a possible prime?
  //x is a bigInt, and b is an integer, with b<x
  function millerRabinInt(x,b) {
    if (mr_x1.length!=x.length) {
      mr_x1=dup(x);
      mr_r=dup(x);
      mr_a=dup(x);
    }

    copyInt_(mr_a,b);
    return millerRabin(x,mr_a);
  }

  //does a single round of Miller-Rabin base b consider x to be a possible prime?
  //x and b are bigInts with b<x
  function millerRabin(x,b) {
    var i,j,k,s;

    if (mr_x1.length!=x.length) {
      mr_x1=dup(x);
      mr_r=dup(x);
      mr_a=dup(x);
    }

    copy_(mr_a,b);
    copy_(mr_r,x);
    copy_(mr_x1,x);

    addInt_(mr_r,-1);
    addInt_(mr_x1,-1);

    //s=the highest power of two that divides mr_r

    /*
    k=0;
    for (i=0;i<mr_r.length;i++)
      for (j=1;j<mask;j<<=1)
        if (x[i] & j) {
          s=(k<mr_r.length+bpe ? k : 0); 
           i=mr_r.length;
           j=mask;
        } else
          k++;
    */

    /* http://www.javascripter.net/math/primes/millerrabinbug-bigint54.htm */
    if (isZero(mr_r)) return 0;
    for (k=0; mr_r[k]==0; k++);
    for (i=1,j=2; mr_r[k]%j==0; j*=2,i++ );
    s = k*bpe + i - 1;
    /* end */

    if (s)                
      rightShift_(mr_r,s);

    powMod_(mr_a,mr_r,x);

    if (!equalsInt(mr_a,1) && !equals(mr_a,mr_x1)) {
      j=1;
      while (j<=s-1 && !equals(mr_a,mr_x1)) {
        squareMod_(mr_a,x);
        if (equalsInt(mr_a,1)) {
          return 0;
        }
        j++;
      }
      if (!equals(mr_a,mr_x1)) {
        return 0;
      }
    }
    return 1;  
  }

  //returns how many bits long the bigInt is, not counting leading zeros.
  function bitSize(x) {
    var j,z,w;
    for (j=x.length-1; (x[j]==0) && (j>0); j--);
    for (z=0,w=x[j]; w; (w>>=1),z++);
    z+=bpe*j;
    return z;
  }

  //return a copy of x with at least n elements, adding leading zeros if needed
  function expand(x,n) {
    var ans=int2bigInt(0,(x.length>n ? x.length : n)*bpe,0);
    copy_(ans,x);
    return ans;
  }

  //return a k-bit true random prime using Maurer's algorithm.
  function randTruePrime(k) {
    var ans=int2bigInt(0,k,0);
    randTruePrime_(ans,k);
    return trim(ans,1);
  }

  //return a k-bit random probable prime with probability of error < 2^-80
  function randProbPrime(k) {
    if (k>=600) return randProbPrimeRounds(k,2); //numbers from HAC table 4.3
    if (k>=550) return randProbPrimeRounds(k,4);
    if (k>=500) return randProbPrimeRounds(k,5);
    if (k>=400) return randProbPrimeRounds(k,6);
    if (k>=350) return randProbPrimeRounds(k,7);
    if (k>=300) return randProbPrimeRounds(k,9);
    if (k>=250) return randProbPrimeRounds(k,12); //numbers from HAC table 4.4
    if (k>=200) return randProbPrimeRounds(k,15);
    if (k>=150) return randProbPrimeRounds(k,18);
    if (k>=100) return randProbPrimeRounds(k,27);
                return randProbPrimeRounds(k,40); //number from HAC remark 4.26 (only an estimate)
  }

  //return a k-bit probable random prime using n rounds of Miller Rabin (after trial division with small primes)
  function randProbPrimeRounds(k,n) {
    var ans, i, divisible, B; 
    B=30000;  //B is largest prime to use in trial division
    ans=int2bigInt(0,k,0);
    
    //optimization: try larger and smaller B to find the best limit.
    
    if (primes.length==0)
      primes=findPrimes(30000);  //check for divisibility by primes <=30000

    if (rpprb.length!=ans.length)
      rpprb=dup(ans);

    for (;;) { //keep trying random values for ans until one appears to be prime
      //optimization: pick a random number times L=2*3*5*...*p, plus a 
      //   random element of the list of all numbers in [0,L) not divisible by any prime up to p.
      //   This can reduce the amount of random number generation.
      
      randBigInt_(ans,k,0); //ans = a random odd number to check
      ans[0] |= 1; 
      divisible=0;
    
      //check ans for divisibility by small primes up to B
      for (i=0; (i<primes.length) && (primes[i]<=B); i++)
        if (modInt(ans,primes[i])==0 && !equalsInt(ans,primes[i])) {
          divisible=1;
          break;
        }      
      
      //optimization: change millerRabin so the base can be bigger than the number being checked, then eliminate the while here.
      
      //do n rounds of Miller Rabin, with random bases less than ans
      for (i=0; i<n && !divisible; i++) {
        randBigInt_(rpprb,k,0);
        while(!greater(ans,rpprb)) //pick a random rpprb that's < ans
          randBigInt_(rpprb,k,0);
        if (!millerRabin(ans,rpprb))
          divisible=1;
      }
      
      if(!divisible)
        return ans;
    }  
  }

  //return a new bigInt equal to (x mod n) for bigInts x and n.
  function mod(x,n) {
    var ans=dup(x);
    mod_(ans,n);
    return trim(ans,1);
  }

  //return (x+n) where x is a bigInt and n is an integer.
  function addInt(x,n) {
    var ans=expand(x,x.length+1);
    addInt_(ans,n);
    return trim(ans,1);
  }

  //return x*y for bigInts x and y. This is faster when y<x.
  function mult(x,y) {
    var ans=expand(x,x.length+y.length);
    mult_(ans,y);
    return trim(ans,1);
  }

  //return (x**y mod n) where x,y,n are bigInts and ** is exponentiation.  0**0=1. Faster for odd n.
  function powMod(x,y,n) {
    var ans=expand(x,n.length);  
    powMod_(ans,trim(y,2),trim(n,2),0);  //this should work without the trim, but doesn't
    return trim(ans,1);
  }

  //return (x-y) for bigInts x and y.  Negative answers will be 2s complement
  function sub(x,y) {
    var ans=expand(x,(x.length>y.length ? x.length+1 : y.length+1)); 
    sub_(ans,y);
    return trim(ans,1);
  }

  //return (x+y) for bigInts x and y.  
  function add(x,y) {
    var ans=expand(x,(x.length>y.length ? x.length+1 : y.length+1)); 
    add_(ans,y);
    return trim(ans,1);
  }

  //return (x**(-1) mod n) for bigInts x and n.  If no inverse exists, it returns null
  function inverseMod(x,n) {
    var ans=expand(x,n.length); 
    var s;
    s=inverseMod_(ans,n);
    return s ? trim(ans,1) : null;
  }

  //return (x*y mod n) for bigInts x,y,n.  For greater speed, let y<x.
  function multMod(x,y,n) {
    var ans=expand(x,n.length);
    multMod_(ans,y,n);
    return trim(ans,1);
  }

  //generate a k-bit true random prime using Maurer's algorithm,
  //and put it into ans.  The bigInt ans must be large enough to hold it.
  function randTruePrime_(ans,k) {
    var c,w,m,pm,dd,j,r,B,divisible,z,zz,recSize,recLimit;

    if (primes.length==0)
      primes=findPrimes(30000);  //check for divisibility by primes <=30000

    if (pows.length==0) {
      pows=new Array(512);
      for (j=0;j<512;j++) {
        pows[j]=Math.pow(2,j/511.0-1.0);
      }
    }

    //c and m should be tuned for a particular machine and value of k, to maximize speed
    c=0.1;  //c=0.1 in HAC
    m=20;   //generate this k-bit number by first recursively generating a number that has between k/2 and k-m bits
    recLimit=20; //stop recursion when k <=recLimit.  Must have recLimit >= 2

    if (s_i2.length!=ans.length) {
      s_i2=dup(ans);
      s_R =dup(ans);
      s_n1=dup(ans);
      s_r2=dup(ans);
      s_d =dup(ans);
      s_x1=dup(ans);
      s_x2=dup(ans);
      s_b =dup(ans);
      s_n =dup(ans);
      s_i =dup(ans);
      s_rm=dup(ans);
      s_q =dup(ans);
      s_a =dup(ans);
      s_aa=dup(ans);
    }

    if (k <= recLimit) {  //generate small random primes by trial division up to its square root
      pm=(1<<((k+2)>>1))-1; //pm is binary number with all ones, just over sqrt(2^k)
      copyInt_(ans,0);
      for (dd=1;dd;) {
        dd=0;
        ans[0]= 1 | (1<<(k-1)) | Math.floor(Math.random()*(1<<k));  //random, k-bit, odd integer, with msb 1
        for (j=1;(j<primes.length) && ((primes[j]&pm)==primes[j]);j++) { //trial division by all primes 3...sqrt(2^k)
          if (0==(ans[0]%primes[j])) {
            dd=1;
            break;
          }
        }
      }
      carry_(ans);
      return;
    }

    B=c*k*k;    //try small primes up to B (or all the primes[] array if the largest is less than B).
    if (k>2*m)  //generate this k-bit number by first recursively generating a number that has between k/2 and k-m bits
      for (r=1; k-k*r<=m; )
        r=pows[Math.floor(Math.random()*512)];   //r=Math.pow(2,Math.random()-1);
    else
      r=0.5;

    //simulation suggests the more complex algorithm using r=.333 is only slightly faster.

    recSize=Math.floor(r*k)+1;

    randTruePrime_(s_q,recSize);
    copyInt_(s_i2,0);
    s_i2[Math.floor((k-2)/bpe)] |= (1<<((k-2)%bpe));   //s_i2=2^(k-2)
    divide_(s_i2,s_q,s_i,s_rm);                        //s_i=floor((2^(k-1))/(2q))

    z=bitSize(s_i);

    for (;;) {
      for (;;) {  //generate z-bit numbers until one falls in the range [0,s_i-1]
        randBigInt_(s_R,z,0);
        if (greater(s_i,s_R))
          break;
      }                //now s_R is in the range [0,s_i-1]
      addInt_(s_R,1);  //now s_R is in the range [1,s_i]
      add_(s_R,s_i);   //now s_R is in the range [s_i+1,2*s_i]

      copy_(s_n,s_q);
      mult_(s_n,s_R); 
      multInt_(s_n,2);
      addInt_(s_n,1);    //s_n=2*s_R*s_q+1
      
      copy_(s_r2,s_R);
      multInt_(s_r2,2);  //s_r2=2*s_R

      //check s_n for divisibility by small primes up to B
      for (divisible=0,j=0; (j<primes.length) && (primes[j]<B); j++)
        if (modInt(s_n,primes[j])==0 && !equalsInt(s_n,primes[j])) {
          divisible=1;
          break;
        }      

      if (!divisible)    //if it passes small primes check, then try a single Miller-Rabin base 2
        if (!millerRabinInt(s_n,2)) //this line represents 75% of the total runtime for randTruePrime_ 
          divisible=1;

      if (!divisible) {  //if it passes that test, continue checking s_n
        addInt_(s_n,-3);
        for (j=s_n.length-1;(s_n[j]==0) && (j>0); j--);  //strip leading zeros
        for (zz=0,w=s_n[j]; w; (w>>=1),zz++);
        zz+=bpe*j;                             //zz=number of bits in s_n, ignoring leading zeros
        for (;;) {  //generate z-bit numbers until one falls in the range [0,s_n-1]
          randBigInt_(s_a,zz,0);
          if (greater(s_n,s_a))
            break;
        }                //now s_a is in the range [0,s_n-1]
        addInt_(s_n,3);  //now s_a is in the range [0,s_n-4]
        addInt_(s_a,2);  //now s_a is in the range [2,s_n-2]
        copy_(s_b,s_a);
        copy_(s_n1,s_n);
        addInt_(s_n1,-1);
        powMod_(s_b,s_n1,s_n);   //s_b=s_a^(s_n-1) modulo s_n
        addInt_(s_b,-1);
        if (isZero(s_b)) {
          copy_(s_b,s_a);
          powMod_(s_b,s_r2,s_n);
          addInt_(s_b,-1);
          copy_(s_aa,s_n);
          copy_(s_d,s_b);
          GCD_(s_d,s_n);  //if s_b and s_n are relatively prime, then s_n is a prime
          if (equalsInt(s_d,1)) {
            copy_(ans,s_aa);
            return;     //if we've made it this far, then s_n is absolutely guaranteed to be prime
          }
        }
      }
    }
  }

  //Return an n-bit random BigInt (n>=1).  If s=1, then the most significant of those n bits is set to 1.
  function randBigInt(n,s) {
    var a,b;
    a=Math.floor((n-1)/bpe)+2; //# array elements to hold the BigInt with a leading 0 element
    b=int2bigInt(0,0,a);
    randBigInt_(b,n,s);
    return b;
  }

  //Set b to an n-bit random BigInt.  If s=1, then the most significant of those n bits is set to 1.
  //Array b must be big enough to hold the result. Must have n>=1
  function randBigInt_(b,n,s) {
    var i,a;
    for (i=0;i<b.length;i++)
      b[i]=0;
    a=Math.floor((n-1)/bpe)+1; //# array elements to hold the BigInt
    for (i=0;i<a;i++) {
      b[i]=Math.floor(Math.random()*(1<<(bpe-1)));
    }
    b[a-1] &= (2<<((n-1)%bpe))-1;
    if (s==1)
      b[a-1] |= (1<<((n-1)%bpe));
  }

  //Return the greatest common divisor of bigInts x and y (each with same number of elements).
  function GCD(x,y) {
    var xc,yc;
    xc=dup(x);
    yc=dup(y);
    GCD_(xc,yc);
    return xc;
  }

  //set x to the greatest common divisor of bigInts x and y (each with same number of elements).
  //y is destroyed.
  function GCD_(x,y) {
    var i,xp,yp,A,B,C,D,q,sing,qp;
    if (T.length!=x.length)
      T=dup(x);

    sing=1;
    while (sing) { //while y has nonzero elements other than y[0]
      sing=0;
      for (i=1;i<y.length;i++) //check if y has nonzero elements other than 0
        if (y[i]) {
          sing=1;
          break;
        }
      if (!sing) break; //quit when y all zero elements except possibly y[0]

      for (i=x.length;!x[i] && i>=0;i--);  //find most significant element of x
      xp=x[i];
      yp=y[i];
      A=1; B=0; C=0; D=1;
      while ((yp+C) && (yp+D)) {
        q =Math.floor((xp+A)/(yp+C));
        qp=Math.floor((xp+B)/(yp+D));
        if (q!=qp)
          break;
        t= A-q*C;   A=C;   C=t;    //  do (A,B,xp, C,D,yp) = (C,D,yp, A,B,xp) - q*(0,0,0, C,D,yp)      
        t= B-q*D;   B=D;   D=t;
        t=xp-q*yp; xp=yp; yp=t;
      }
      if (B) {
        copy_(T,x);
        linComb_(x,y,A,B); //x=A*x+B*y
        linComb_(y,T,D,C); //y=D*y+C*T
      } else {
        mod_(x,y);
        copy_(T,x);
        copy_(x,y);
        copy_(y,T);
      } 
    }
    if (y[0]==0)
      return;
    t=modInt(x,y[0]);
    copyInt_(x,y[0]);
    y[0]=t;
    while (y[0]) {
      x[0]%=y[0];
      t=x[0]; x[0]=y[0]; y[0]=t;
    }
  }

  //do x=x**(-1) mod n, for bigInts x and n.
  //If no inverse exists, it sets x to zero and returns 0, else it returns 1.
  //The x array must be at least as large as the n array.
  function inverseMod_(x,n) {
    var k=1+2*Math.max(x.length,n.length);

    if(!(x[0]&1)  && !(n[0]&1)) {  //if both inputs are even, then inverse doesn't exist
      copyInt_(x,0);
      return 0;
    }

    if (eg_u.length!=k) {
      eg_u=new Array(k);
      eg_v=new Array(k);
      eg_A=new Array(k);
      eg_B=new Array(k);
      eg_C=new Array(k);
      eg_D=new Array(k);
    }

    copy_(eg_u,x);
    copy_(eg_v,n);
    copyInt_(eg_A,1);
    copyInt_(eg_B,0);
    copyInt_(eg_C,0);
    copyInt_(eg_D,1);
    for (;;) {
      while(!(eg_u[0]&1)) {  //while eg_u is even
        halve_(eg_u);
        if (!(eg_A[0]&1) && !(eg_B[0]&1)) { //if eg_A==eg_B==0 mod 2
          halve_(eg_A);
          halve_(eg_B);      
        } else {
          add_(eg_A,n);  halve_(eg_A);
          sub_(eg_B,x);  halve_(eg_B);
        }
      }

      while (!(eg_v[0]&1)) {  //while eg_v is even
        halve_(eg_v);
        if (!(eg_C[0]&1) && !(eg_D[0]&1)) { //if eg_C==eg_D==0 mod 2
          halve_(eg_C);
          halve_(eg_D);      
        } else {
          add_(eg_C,n);  halve_(eg_C);
          sub_(eg_D,x);  halve_(eg_D);
        }
      }

      if (!greater(eg_v,eg_u)) { //eg_v <= eg_u
        sub_(eg_u,eg_v);
        sub_(eg_A,eg_C);
        sub_(eg_B,eg_D);
      } else {                   //eg_v > eg_u
        sub_(eg_v,eg_u);
        sub_(eg_C,eg_A);
        sub_(eg_D,eg_B);
      }
    
      if (equalsInt(eg_u,0)) {
        if (negative(eg_C)) //make sure answer is nonnegative
          add_(eg_C,n);
        copy_(x,eg_C);

        if (!equalsInt(eg_v,1)) { //if GCD_(x,n)!=1, then there is no inverse
          copyInt_(x,0);
          return 0;
        }
        return 1;
      }
    }
  }

  //return x**(-1) mod n, for integers x and n.  Return 0 if there is no inverse
  function inverseModInt(x,n) {
    var a=1,b=0,t;
    for (;;) {
      if (x==1) return a;
      if (x==0) return 0;
      b-=a*Math.floor(n/x);
      n%=x;

      if (n==1) return b; //to avoid negatives, change this b to n-b, and each -= to +=
      if (n==0) return 0;
      a-=b*Math.floor(x/n);
      x%=n;
    }
  }

  //this deprecated function is for backward compatibility only. 
  function inverseModInt_(x,n) {
     return inverseModInt(x,n);
  }


  //Given positive bigInts x and y, change the bigints v, a, and b to positive bigInts such that:
  //     v = GCD_(x,y) = a*x-b*y
  //The bigInts v, a, b, must have exactly as many elements as the larger of x and y.
  function eGCD_(x,y,v,a,b) {
    var g=0;
    var k=Math.max(x.length,y.length);
    if (eg_u.length!=k) {
      eg_u=new Array(k);
      eg_A=new Array(k);
      eg_B=new Array(k);
      eg_C=new Array(k);
      eg_D=new Array(k);
    }
    while(!(x[0]&1)  && !(y[0]&1)) {  //while x and y both even
      halve_(x);
      halve_(y);
      g++;
    }
    copy_(eg_u,x);
    copy_(v,y);
    copyInt_(eg_A,1);
    copyInt_(eg_B,0);
    copyInt_(eg_C,0);
    copyInt_(eg_D,1);
    for (;;) {
      while(!(eg_u[0]&1)) {  //while u is even
        halve_(eg_u);
        if (!(eg_A[0]&1) && !(eg_B[0]&1)) { //if A==B==0 mod 2
          halve_(eg_A);
          halve_(eg_B);      
        } else {
          add_(eg_A,y);  halve_(eg_A);
          sub_(eg_B,x);  halve_(eg_B);
        }
      }

      while (!(v[0]&1)) {  //while v is even
        halve_(v);
        if (!(eg_C[0]&1) && !(eg_D[0]&1)) { //if C==D==0 mod 2
          halve_(eg_C);
          halve_(eg_D);      
        } else {
          add_(eg_C,y);  halve_(eg_C);
          sub_(eg_D,x);  halve_(eg_D);
        }
      }

      if (!greater(v,eg_u)) { //v<=u
        sub_(eg_u,v);
        sub_(eg_A,eg_C);
        sub_(eg_B,eg_D);
      } else {                //v>u
        sub_(v,eg_u);
        sub_(eg_C,eg_A);
        sub_(eg_D,eg_B);
      }
      if (equalsInt(eg_u,0)) {
        if (negative(eg_C)) {   //make sure a (C)is nonnegative
          add_(eg_C,y);
          sub_(eg_D,x);
        }
        multInt_(eg_D,-1);  ///make sure b (D) is nonnegative
        copy_(a,eg_C);
        copy_(b,eg_D);
        leftShift_(v,g);
        return;
      }
    }
  }


  //is bigInt x negative?
  function negative(x) {
    return ((x[x.length-1]>>(bpe-1))&1);
  }


  //is (x << (shift*bpe)) > y?
  //x and y are nonnegative bigInts
  //shift is a nonnegative integer
  function greaterShift(x,y,shift) {
    var i, kx=x.length, ky=y.length;
    var k=((kx+shift)<ky) ? (kx+shift) : ky;
    for (i=ky-1-shift; i<kx && i>=0; i++) 
      if (x[i]>0)
        return 1; //if there are nonzeros in x to the left of the first column of y, then x is bigger
    for (i=kx-1+shift; i<ky; i++)
      if (y[i]>0)
        return 0; //if there are nonzeros in y to the left of the first column of x, then x is not bigger
    for (i=k-1; i>=shift; i--)
      if      (x[i-shift]>y[i]) return 1;
      else if (x[i-shift]<y[i]) return 0;
    return 0;
  }

  //is x > y? (x and y both nonnegative)
  function greater(x,y) {
    var i;
    var k=(x.length<y.length) ? x.length : y.length;

    for (i=x.length;i<y.length;i++)
      if (y[i])
        return 0;  //y has more digits

    for (i=y.length;i<x.length;i++)
      if (x[i])
        return 1;  //x has more digits

    for (i=k-1;i>=0;i--)
      if (x[i]>y[i])
        return 1;
      else if (x[i]<y[i])
        return 0;
    return 0;
  }

  //divide x by y giving quotient q and remainder r.  (q=floor(x/y),  r=x mod y).  All 4 are bigints.
  //x must have at least one leading zero element.
  //y must be nonzero.
  //q and r must be arrays that are exactly the same length as x. (Or q can have more).
  //Must have x.length >= y.length >= 2.
  function divide_(x,y,q,r) {
    var kx, ky;
    var i,j,y1,y2,c,a,b;
    copy_(r,x);
    for (ky=y.length;y[ky-1]==0;ky--); //ky is number of elements in y, not including leading zeros

    //normalize: ensure the most significant element of y has its highest bit set  
    b=y[ky-1];
    for (a=0; b; a++)
      b>>=1;  
    a=bpe-a;  //a is how many bits to shift so that the high order bit of y is leftmost in its array element
    leftShift_(y,a);  //multiply both by 1<<a now, then divide both by that at the end
    leftShift_(r,a);

    //Rob Visser discovered a bug: the following line was originally just before the normalization.
    for (kx=r.length;r[kx-1]==0 && kx>ky;kx--); //kx is number of elements in normalized x, not including leading zeros

    copyInt_(q,0);                      // q=0
    while (!greaterShift(y,r,kx-ky)) {  // while (leftShift_(y,kx-ky) <= r) {
      subShift_(r,y,kx-ky);             //   r=r-leftShift_(y,kx-ky)
      q[kx-ky]++;                       //   q[kx-ky]++;
    }                                   // }

    for (i=kx-1; i>=ky; i--) {
      if (r[i]==y[ky-1])
        q[i-ky]=mask;
      else
        q[i-ky]=Math.floor((r[i]*radix+r[i-1])/y[ky-1]);

      //The following for(;;) loop is equivalent to the commented while loop, 
      //except that the uncommented version avoids overflow.
      //The commented loop comes from HAC, which assumes r[-1]==y[-1]==0
      //  while (q[i-ky]*(y[ky-1]*radix+y[ky-2]) > r[i]*radix*radix+r[i-1]*radix+r[i-2])
      //    q[i-ky]--;    
      for (;;) {
        y2=(ky>1 ? y[ky-2] : 0)*q[i-ky];
        c=y2>>bpe;
        y2=y2 & mask;
        y1=c+q[i-ky]*y[ky-1];
        c=y1>>bpe;
        y1=y1 & mask;

        if (c==r[i] ? y1==r[i-1] ? y2>(i>1 ? r[i-2] : 0) : y1>r[i-1] : c>r[i]) 
          q[i-ky]--;
        else
          break;
      }

      linCombShift_(r,y,-q[i-ky],i-ky);    //r=r-q[i-ky]*leftShift_(y,i-ky)
      if (negative(r)) {
        addShift_(r,y,i-ky);         //r=r+leftShift_(y,i-ky)
        q[i-ky]--;
      }
    }

    rightShift_(y,a);  //undo the normalization step
    rightShift_(r,a);  //undo the normalization step
  }

  //do carries and borrows so each element of the bigInt x fits in bpe bits.
  function carry_(x) {
    var i,k,c,b;
    k=x.length;
    c=0;
    for (i=0;i<k;i++) {
      c+=x[i];
      b=0;
      if (c<0) {
        b=-(c>>bpe);
        c+=b*radix;
      }
      x[i]=c & mask;
      c=(c>>bpe)-b;
    }
  }

  //return x mod n for bigInt x and integer n.
  function modInt(x,n) {
    var i,c=0;
    for (i=x.length-1; i>=0; i--)
      c=(c*radix+x[i])%n;
    return c;
  }

  //convert the integer t into a bigInt with at least the given number of bits.
  //the returned array stores the bigInt in bpe-bit chunks, little endian (buff[0] is least significant word)
  //Pad the array with leading zeros so that it has at least minSize elements.
  //There will always be at least one leading 0 element.
  function int2bigInt(t,bits,minSize) {   
    var i,k, buff;
    k=Math.ceil(bits/bpe)+1;
    k=minSize>k ? minSize : k;
    buff=new Array(k);
    copyInt_(buff,t);
    return buff;
  }

  //return the bigInt given a string representation in a given base.  
  //Pad the array with leading zeros so that it has at least minSize elements.
  //If base=-1, then it reads in a space-separated list of array elements in decimal.
  //The array will always have at least one leading zero, unless base=-1.
  function str2bigInt(s,base,minSize) {
    var d, i, j, x, y, kk;
    var k=s.length;
    if (base==-1) { //comma-separated list of array elements in decimal
      x=new Array(0);
      for (;;) {
        y=new Array(x.length+1);
        for (i=0;i<x.length;i++)
          y[i+1]=x[i];
        y[0]=parseInt(s,10);
        x=y;
        d=s.indexOf(',',0);
        if (d<1) 
          break;
        s=s.substring(d+1);
        if (s.length==0)
          break;
      }
      if (x.length<minSize) {
        y=new Array(minSize);
        copy_(y,x);
        return y;
      }
      return x;
    }

    x=int2bigInt(0,base*k,0);
    for (i=0;i<k;i++) {
      d=digitsStr.indexOf(s.substring(i,i+1),0);
      if (base<=36 && d>=36)  //convert lowercase to uppercase if base<=36
        d-=26;
      if (d>=base || d<0) {   //stop at first illegal character
        break;
      }
      multInt_(x,base);
      addInt_(x,d);
    }

    for (k=x.length;k>0 && !x[k-1];k--); //strip off leading zeros
    k=minSize>k+1 ? minSize : k+1;
    y=new Array(k);
    kk=k<x.length ? k : x.length;
    for (i=0;i<kk;i++)
      y[i]=x[i];
    for (;i<k;i++)
      y[i]=0;
    return y;
  }

  //is bigint x equal to integer y?
  //y must have less than bpe bits
  function equalsInt(x,y) {
    var i;
    if (x[0]!=y)
      return 0;
    for (i=1;i<x.length;i++)
      if (x[i])
        return 0;
    return 1;
  }

  //are bigints x and y equal?
  //this works even if x and y are different lengths and have arbitrarily many leading zeros
  function equals(x,y) {
    var i;
    var k=x.length<y.length ? x.length : y.length;
    for (i=0;i<k;i++)
      if (x[i]!=y[i])
        return 0;
    if (x.length>y.length) {
      for (;i<x.length;i++)
        if (x[i])
          return 0;
    } else {
      for (;i<y.length;i++)
        if (y[i])
          return 0;
    }
    return 1;
  }

  //is the bigInt x equal to zero?
  function isZero(x) {
    var i;
    for (i=0;i<x.length;i++)
      if (x[i])
        return 0;
    return 1;
  }

  //convert a bigInt into a string in a given base, from base 2 up to base 95.
  //Base -1 prints the contents of the array representing the number.
  function bigInt2str(x,base) {
    var i,t,s="";

    if (s6.length!=x.length) 
      s6=dup(x);
    else
      copy_(s6,x);

    if (base==-1) { //return the list of array contents
      for (i=x.length-1;i>0;i--)
        s+=x[i]+',';
      s+=x[0];
    }
    else { //return it in the given base
      while (!isZero(s6)) {
        t=divInt_(s6,base);  //t=s6 % base; s6=floor(s6/base);
        s=digitsStr.substring(t,t+1)+s;
      }
    }
    if (s.length==0)
      s="0";
    return s;
  }

  //returns a duplicate of bigInt x
  function dup(x) {
    var i, buff;
    buff=new Array(x.length);
    copy_(buff,x);
    return buff;
  }

  //do x=y on bigInts x and y.  x must be an array at least as big as y (not counting the leading zeros in y).
  function copy_(x,y) {
    var i;
    var k=x.length<y.length ? x.length : y.length;
    for (i=0;i<k;i++)
      x[i]=y[i];
    for (i=k;i<x.length;i++)
      x[i]=0;
  }

  //do x=y on bigInt x and integer y.  
  function copyInt_(x,n) {
    var i,c;
    for (c=n,i=0;i<x.length;i++) {
      x[i]=c & mask;
      c>>=bpe;
    }
  }

  //do x=x+n where x is a bigInt and n is an integer.
  //x must be large enough to hold the result.
  function addInt_(x,n) {
    var i,k,c,b;
    x[0]+=n;
    k=x.length;
    c=0;
    for (i=0;i<k;i++) {
      c+=x[i];
      b=0;
      if (c<0) {
        b=-(c>>bpe);
        c+=b*radix;
      }
      x[i]=c & mask;
      c=(c>>bpe)-b;
      if (!c) return; //stop carrying as soon as the carry is zero
    }
  }

  //right shift bigInt x by n bits.  0 <= n < bpe.
  function rightShift_(x,n) {
    var i;
    var k=Math.floor(n/bpe);
    if (k) {
      for (i=0;i<x.length-k;i++) //right shift x by k elements
        x[i]=x[i+k];
      for (;i<x.length;i++)
        x[i]=0;
      n%=bpe;
    }
    for (i=0;i<x.length-1;i++) {
      x[i]=mask & ((x[i+1]<<(bpe-n)) | (x[i]>>n));
    }
    x[i]>>=n;
  }

  //do x=floor(|x|/2)*sgn(x) for bigInt x in 2's complement
  function halve_(x) {
    var i;
    for (i=0;i<x.length-1;i++) {
      x[i]=mask & ((x[i+1]<<(bpe-1)) | (x[i]>>1));
    }
    x[i]=(x[i]>>1) | (x[i] & (radix>>1));  //most significant bit stays the same
  }

  //left shift bigInt x by n bits.
  function leftShift_(x,n) {
    var i;
    var k=Math.floor(n/bpe);
    if (k) {
      for (i=x.length; i>=k; i--) //left shift x by k elements
        x[i]=x[i-k];
      for (;i>=0;i--)
        x[i]=0;  
      n%=bpe;
    }
    if (!n)
      return;
    for (i=x.length-1;i>0;i--) {
      x[i]=mask & ((x[i]<<n) | (x[i-1]>>(bpe-n)));
    }
    x[i]=mask & (x[i]<<n);
  }

  //do x=x*n where x is a bigInt and n is an integer.
  //x must be large enough to hold the result.
  function multInt_(x,n) {
    var i,k,c,b;
    if (!n)
      return;
    k=x.length;
    c=0;
    for (i=0;i<k;i++) {
      c+=x[i]*n;
      b=0;
      if (c<0) {
        b=-(c>>bpe);
        c+=b*radix;
      }
      x[i]=c & mask;
      c=(c>>bpe)-b;
    }
  }

  //do x=floor(x/n) for bigInt x and integer n, and return the remainder
  function divInt_(x,n) {
    var i,r=0,s;
    for (i=x.length-1;i>=0;i--) {
      s=r*radix+x[i];
      x[i]=Math.floor(s/n);
      r=s%n;
    }
    return r;
  }

  //do the linear combination x=a*x+b*y for bigInts x and y, and integers a and b.
  //x must be large enough to hold the answer.
  function linComb_(x,y,a,b) {
    var i,c,k,kk;
    k=x.length<y.length ? x.length : y.length;
    kk=x.length;
    for (c=0,i=0;i<k;i++) {
      c+=a*x[i]+b*y[i];
      x[i]=c & mask;
      c>>=bpe;
    }
    for (i=k;i<kk;i++) {
      c+=a*x[i];
      x[i]=c & mask;
      c>>=bpe;
    }
  }

  //do the linear combination x=a*x+b*(y<<(ys*bpe)) for bigInts x and y, and integers a, b and ys.
  //x must be large enough to hold the answer.
  function linCombShift_(x,y,b,ys) {
    var i,c,k,kk;
    k=x.length<ys+y.length ? x.length : ys+y.length;
    kk=x.length;
    for (c=0,i=ys;i<k;i++) {
      c+=x[i]+b*y[i-ys];
      x[i]=c & mask;
      c>>=bpe;
    }
    for (i=k;c && i<kk;i++) {
      c+=x[i];
      x[i]=c & mask;
      c>>=bpe;
    }
  }

  //do x=x+(y<<(ys*bpe)) for bigInts x and y, and integers a,b and ys.
  //x must be large enough to hold the answer.
  function addShift_(x,y,ys) {
    var i,c,k,kk;
    k=x.length<ys+y.length ? x.length : ys+y.length;
    kk=x.length;
    for (c=0,i=ys;i<k;i++) {
      c+=x[i]+y[i-ys];
      x[i]=c & mask;
      c>>=bpe;
    }
    for (i=k;c && i<kk;i++) {
      c+=x[i];
      x[i]=c & mask;
      c>>=bpe;
    }
  }

  //do x=x-(y<<(ys*bpe)) for bigInts x and y, and integers a,b and ys.
  //x must be large enough to hold the answer.
  function subShift_(x,y,ys) {
    var i,c,k,kk;
    k=x.length<ys+y.length ? x.length : ys+y.length;
    kk=x.length;
    for (c=0,i=ys;i<k;i++) {
      c+=x[i]-y[i-ys];
      x[i]=c & mask;
      c>>=bpe;
    }
    for (i=k;c && i<kk;i++) {
      c+=x[i];
      x[i]=c & mask;
      c>>=bpe;
    }
  }

  //do x=x-y for bigInts x and y.
  //x must be large enough to hold the answer.
  //negative answers will be 2s complement
  function sub_(x,y) {
    var i,c,k,kk;
    k=x.length<y.length ? x.length : y.length;
    for (c=0,i=0;i<k;i++) {
      c+=x[i]-y[i];
      x[i]=c & mask;
      c>>=bpe;
    }
    for (i=k;c && i<x.length;i++) {
      c+=x[i];
      x[i]=c & mask;
      c>>=bpe;
    }
  }

  //do x=x+y for bigInts x and y.
  //x must be large enough to hold the answer.
  function add_(x,y) {
    var i,c,k,kk;
    k=x.length<y.length ? x.length : y.length;
    for (c=0,i=0;i<k;i++) {
      c+=x[i]+y[i];
      x[i]=c & mask;
      c>>=bpe;
    }
    for (i=k;c && i<x.length;i++) {
      c+=x[i];
      x[i]=c & mask;
      c>>=bpe;
    }
  }

  //do x=x*y for bigInts x and y.  This is faster when y<x.
  function mult_(x,y) {
    var i;
    if (ss.length!=2*x.length)
      ss=new Array(2*x.length);
    copyInt_(ss,0);
    for (i=0;i<y.length;i++)
      if (y[i])
        linCombShift_(ss,x,y[i],i);   //ss=1*ss+y[i]*(x<<(i*bpe))
    copy_(x,ss);
  }

  //do x=x mod n for bigInts x and n.
  function mod_(x,n) {
    if (s4.length!=x.length)
      s4=dup(x);
    else
      copy_(s4,x);
    if (s5.length!=x.length)
      s5=dup(x);  
    divide_(s4,n,s5,x);  //x = remainder of s4 / n
  }

  //do x=x*y mod n for bigInts x,y,n.
  //for greater speed, let y<x.
  function multMod_(x,y,n) {
    var i;
    if (s0.length!=2*x.length)
      s0=new Array(2*x.length);
    copyInt_(s0,0);
    for (i=0;i<y.length;i++)
      if (y[i])
        linCombShift_(s0,x,y[i],i);   //s0=1*s0+y[i]*(x<<(i*bpe))
    mod_(s0,n);
    copy_(x,s0);
  }

  //do x=x*x mod n for bigInts x,n.
  function squareMod_(x,n) {
    var i,j,d,c,kx,kn,k;
    for (kx=x.length; kx>0 && !x[kx-1]; kx--);  //ignore leading zeros in x
    k=kx>n.length ? 2*kx : 2*n.length; //k=# elements in the product, which is twice the elements in the larger of x and n
    if (s0.length!=k) 
      s0=new Array(k);
    copyInt_(s0,0);
    for (i=0;i<kx;i++) {
      c=s0[2*i]+x[i]*x[i];
      s0[2*i]=c & mask;
      c>>=bpe;
      for (j=i+1;j<kx;j++) {
        c=s0[i+j]+2*x[i]*x[j]+c;
        s0[i+j]=(c & mask);
        c>>=bpe;
      }
      s0[i+kx]=c;
    }
    mod_(s0,n);
    copy_(x,s0);
  }

  //return x with exactly k leading zero elements
  function trim(x,k) {
    var i,y;
    for (i=x.length; i>0 && !x[i-1]; i--);
    y=new Array(i+k);
    copy_(y,x);
    return y;
  }

  //do x=x**y mod n, where x,y,n are bigInts and ** is exponentiation.  0**0=1.
  //this is faster when n is odd.  x usually needs to have as many elements as n.
  function powMod_(x,y,n) {
    var k1,k2,kn,np;
    if(s7.length!=n.length)
      s7=dup(n);

    //for even modulus, use a simple square-and-multiply algorithm,
    //rather than using the more complex Montgomery algorithm.
    if ((n[0]&1)==0) {
      copy_(s7,x);
      copyInt_(x,1);
      while(!equalsInt(y,0)) {
        if (y[0]&1)
          multMod_(x,s7,n);
        divInt_(y,2);
        squareMod_(s7,n); 
      }
      return;
    }

    //calculate np from n for the Montgomery multiplications
    copyInt_(s7,0);
    for (kn=n.length;kn>0 && !n[kn-1];kn--);
    np=radix-inverseModInt(modInt(n,radix),radix);
    s7[kn]=1;
    multMod_(x ,s7,n);   // x = x * 2**(kn*bp) mod n

    if (s3.length!=x.length)
      s3=dup(x);
    else
      copy_(s3,x);

    for (k1=y.length-1;k1>0 & !y[k1]; k1--);  //k1=first nonzero element of y
    if (y[k1]==0) {  //anything to the 0th power is 1
      copyInt_(x,1);
      return;
    }
    for (k2=1<<(bpe-1);k2 && !(y[k1] & k2); k2>>=1);  //k2=position of first 1 bit in y[k1]
    for (;;) {
      if (!(k2>>=1)) {  //look at next bit of y
        k1--;
        if (k1<0) {
          mont_(x,one,n,np);
          return;
        }
        k2=1<<(bpe-1);
      }    
      mont_(x,x,n,np);

      if (k2 & y[k1]) //if next bit is a 1
        mont_(x,s3,n,np);
    }
  }


  //do x=x*y*Ri mod n for bigInts x,y,n, 
  //  where Ri = 2**(-kn*bpe) mod n, and kn is the 
  //  number of elements in the n array, not 
  //  counting leading zeros.  
  //x array must have at least as many elemnts as the n array
  //It's OK if x and y are the same variable.
  //must have:
  //  x,y < n
  //  n is odd
  //  np = -(n^(-1)) mod radix
  function mont_(x,y,n,np) {
    var i,j,c,ui,t,ks;
    var kn=n.length;
    var ky=y.length;

    if (sa.length!=kn)
      sa=new Array(kn);
      
    copyInt_(sa,0);

    for (;kn>0 && n[kn-1]==0;kn--); //ignore leading zeros of n
    for (;ky>0 && y[ky-1]==0;ky--); //ignore leading zeros of y
    ks=sa.length-1; //sa will never have more than this many nonzero elements.  

    //the following loop consumes 95% of the runtime for randTruePrime_() and powMod_() for large numbers
    for (i=0; i<kn; i++) {
      t=sa[0]+x[i]*y[0];
      ui=((t & mask) * np) & mask;  //the inner "& mask" was needed on Safari (but not MSIE) at one time
      c=(t+ui*n[0]) >> bpe;
      t=x[i];
      
      //do sa=(sa+x[i]*y+ui*n)/b   where b=2**bpe.  Loop is unrolled 5-fold for speed
      j=1;
      for (;j<ky-4;) { c+=sa[j]+ui*n[j]+t*y[j];   sa[j-1]=c & mask;   c>>=bpe;   j++;
                       c+=sa[j]+ui*n[j]+t*y[j];   sa[j-1]=c & mask;   c>>=bpe;   j++;
                       c+=sa[j]+ui*n[j]+t*y[j];   sa[j-1]=c & mask;   c>>=bpe;   j++;
                       c+=sa[j]+ui*n[j]+t*y[j];   sa[j-1]=c & mask;   c>>=bpe;   j++;
                       c+=sa[j]+ui*n[j]+t*y[j];   sa[j-1]=c & mask;   c>>=bpe;   j++; }    
      for (;j<ky;)   { c+=sa[j]+ui*n[j]+t*y[j];   sa[j-1]=c & mask;   c>>=bpe;   j++; }
      for (;j<kn-4;) { c+=sa[j]+ui*n[j];          sa[j-1]=c & mask;   c>>=bpe;   j++;
                       c+=sa[j]+ui*n[j];          sa[j-1]=c & mask;   c>>=bpe;   j++;
                       c+=sa[j]+ui*n[j];          sa[j-1]=c & mask;   c>>=bpe;   j++;
                       c+=sa[j]+ui*n[j];          sa[j-1]=c & mask;   c>>=bpe;   j++;
                       c+=sa[j]+ui*n[j];          sa[j-1]=c & mask;   c>>=bpe;   j++; }  
      for (;j<kn;)   { c+=sa[j]+ui*n[j];          sa[j-1]=c & mask;   c>>=bpe;   j++; }   
      for (;j<ks;)   { c+=sa[j];                  sa[j-1]=c & mask;   c>>=bpe;   j++; }  
      sa[j-1]=c & mask;
    }

    if (!greater(n,sa))
      sub_(sa,n);
    copy_(x,sa);
  }

}).call(this)

});

require.define("crypto",function(require,module,exports,__dirname,__filename,process,global){module.exports = require("crypto-browserify")
});

require.define("/node_modules/crypto-browserify/package.json",function(require,module,exports,__dirname,__filename,process,global){module.exports = {}
});

require.define("/node_modules/crypto-browserify/index.js",function(require,module,exports,__dirname,__filename,process,global){var sha = require('./sha')
var rng = require('./rng')
var md5 = require('./md5')

var algorithms = {
  sha1: {
    hex: sha.hex_sha1,
    binary: sha.b64_sha1,
    ascii: sha.str_sha1
  },
  md5: {
    hex: md5.hex_md5,
    binary: md5.b64_md5,
    ascii: md5.any_md5
  }
}

function error () {
  var m = [].slice.call(arguments).join(' ')
  throw new Error([
    m,
    'we accept pull requests',
    'http://github.com/dominictarr/crypto-browserify'
    ].join('\n'))
}

exports.createHash = function (alg) {
  alg = alg || 'sha1'
  if(!algorithms[alg])
    error('algorithm:', alg, 'is not yet supported')
  var s = ''
  var _alg = algorithms[alg]
  return {
    update: function (data) {
      s += data
      return this
    },
    digest: function (enc) {
      enc = enc || 'binary'
      var fn
      if(!(fn = _alg[enc]))
        error('encoding:', enc , 'is not yet supported for algorithm', alg)
      var r = fn(s)
      s = null //not meant to use the hash after you've called digest.
      return r
    }
  }
}

exports.randomBytes = function(size, callback) {
  if (callback && callback.call) {
    try {
      callback.call(this, undefined, rng(size));
    } catch (err) { callback(err); }
  } else {
    return rng(size);
  }
}

// the least I can do is make error messages for the rest of the node.js/crypto api.
;['createCredentials'
, 'createHmac'
, 'createCypher'
, 'createCypheriv'
, 'createDecipher'
, 'createDecipheriv'
, 'createSign'
, 'createVerify'
, 'createDeffieHellman'
, 'pbkdf2'].forEach(function (name) {
  exports[name] = function () {
    error('sorry,', name, 'is not implemented yet')
  }
})

});

require.define("/node_modules/crypto-browserify/sha.js",function(require,module,exports,__dirname,__filename,process,global){/*
 * A JavaScript implementation of the Secure Hash Algorithm, SHA-1, as defined
 * in FIPS PUB 180-1
 * Version 2.1a Copyright Paul Johnston 2000 - 2002.
 * Other contributors: Greg Holt, Andrew Kepert, Ydnar, Lostinet
 * Distributed under the BSD License
 * See http://pajhome.org.uk/crypt/md5 for details.
 */

exports.hex_sha1 = hex_sha1;
exports.b64_sha1 = b64_sha1;
exports.str_sha1 = str_sha1;
exports.hex_hmac_sha1 = hex_hmac_sha1;
exports.b64_hmac_sha1 = b64_hmac_sha1;
exports.str_hmac_sha1 = str_hmac_sha1;

/*
 * Configurable variables. You may need to tweak these to be compatible with
 * the server-side, but the defaults work in most cases.
 */
var hexcase = 0;  /* hex output format. 0 - lowercase; 1 - uppercase        */
var b64pad  = ""; /* base-64 pad character. "=" for strict RFC compliance   */
var chrsz   = 8;  /* bits per input character. 8 - ASCII; 16 - Unicode      */

/*
 * These are the functions you'll usually want to call
 * They take string arguments and return either hex or base-64 encoded strings
 */
function hex_sha1(s){return binb2hex(core_sha1(str2binb(s),s.length * chrsz));}
function b64_sha1(s){return binb2b64(core_sha1(str2binb(s),s.length * chrsz));}
function str_sha1(s){return binb2str(core_sha1(str2binb(s),s.length * chrsz));}
function hex_hmac_sha1(key, data){ return binb2hex(core_hmac_sha1(key, data));}
function b64_hmac_sha1(key, data){ return binb2b64(core_hmac_sha1(key, data));}
function str_hmac_sha1(key, data){ return binb2str(core_hmac_sha1(key, data));}

/*
 * Perform a simple self-test to see if the VM is working
 */
function sha1_vm_test()
{
  return hex_sha1("abc") == "a9993e364706816aba3e25717850c26c9cd0d89d";
}

/*
 * Calculate the SHA-1 of an array of big-endian words, and a bit length
 */
function core_sha1(x, len)
{
  /* append padding */
  x[len >> 5] |= 0x80 << (24 - len % 32);
  x[((len + 64 >> 9) << 4) + 15] = len;

  var w = Array(80);
  var a =  1732584193;
  var b = -271733879;
  var c = -1732584194;
  var d =  271733878;
  var e = -1009589776;

  for(var i = 0; i < x.length; i += 16)
  {
    var olda = a;
    var oldb = b;
    var oldc = c;
    var oldd = d;
    var olde = e;

    for(var j = 0; j < 80; j++)
    {
      if(j < 16) w[j] = x[i + j];
      else w[j] = rol(w[j-3] ^ w[j-8] ^ w[j-14] ^ w[j-16], 1);
      var t = safe_add(safe_add(rol(a, 5), sha1_ft(j, b, c, d)),
                       safe_add(safe_add(e, w[j]), sha1_kt(j)));
      e = d;
      d = c;
      c = rol(b, 30);
      b = a;
      a = t;
    }

    a = safe_add(a, olda);
    b = safe_add(b, oldb);
    c = safe_add(c, oldc);
    d = safe_add(d, oldd);
    e = safe_add(e, olde);
  }
  return Array(a, b, c, d, e);

}

/*
 * Perform the appropriate triplet combination function for the current
 * iteration
 */
function sha1_ft(t, b, c, d)
{
  if(t < 20) return (b & c) | ((~b) & d);
  if(t < 40) return b ^ c ^ d;
  if(t < 60) return (b & c) | (b & d) | (c & d);
  return b ^ c ^ d;
}

/*
 * Determine the appropriate additive constant for the current iteration
 */
function sha1_kt(t)
{
  return (t < 20) ?  1518500249 : (t < 40) ?  1859775393 :
         (t < 60) ? -1894007588 : -899497514;
}

/*
 * Calculate the HMAC-SHA1 of a key and some data
 */
function core_hmac_sha1(key, data)
{
  var bkey = str2binb(key);
  if(bkey.length > 16) bkey = core_sha1(bkey, key.length * chrsz);

  var ipad = Array(16), opad = Array(16);
  for(var i = 0; i < 16; i++)
  {
    ipad[i] = bkey[i] ^ 0x36363636;
    opad[i] = bkey[i] ^ 0x5C5C5C5C;
  }

  var hash = core_sha1(ipad.concat(str2binb(data)), 512 + data.length * chrsz);
  return core_sha1(opad.concat(hash), 512 + 160);
}

/*
 * Add integers, wrapping at 2^32. This uses 16-bit operations internally
 * to work around bugs in some JS interpreters.
 */
function safe_add(x, y)
{
  var lsw = (x & 0xFFFF) + (y & 0xFFFF);
  var msw = (x >> 16) + (y >> 16) + (lsw >> 16);
  return (msw << 16) | (lsw & 0xFFFF);
}

/*
 * Bitwise rotate a 32-bit number to the left.
 */
function rol(num, cnt)
{
  return (num << cnt) | (num >>> (32 - cnt));
}

/*
 * Convert an 8-bit or 16-bit string to an array of big-endian words
 * In 8-bit function, characters >255 have their hi-byte silently ignored.
 */
function str2binb(str)
{
  var bin = Array();
  var mask = (1 << chrsz) - 1;
  for(var i = 0; i < str.length * chrsz; i += chrsz)
    bin[i>>5] |= (str.charCodeAt(i / chrsz) & mask) << (32 - chrsz - i%32);
  return bin;
}

/*
 * Convert an array of big-endian words to a string
 */
function binb2str(bin)
{
  var str = "";
  var mask = (1 << chrsz) - 1;
  for(var i = 0; i < bin.length * 32; i += chrsz)
    str += String.fromCharCode((bin[i>>5] >>> (32 - chrsz - i%32)) & mask);
  return str;
}

/*
 * Convert an array of big-endian words to a hex string.
 */
function binb2hex(binarray)
{
  var hex_tab = hexcase ? "0123456789ABCDEF" : "0123456789abcdef";
  var str = "";
  for(var i = 0; i < binarray.length * 4; i++)
  {
    str += hex_tab.charAt((binarray[i>>2] >> ((3 - i%4)*8+4)) & 0xF) +
           hex_tab.charAt((binarray[i>>2] >> ((3 - i%4)*8  )) & 0xF);
  }
  return str;
}

/*
 * Convert an array of big-endian words to a base-64 string
 */
function binb2b64(binarray)
{
  var tab = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  var str = "";
  for(var i = 0; i < binarray.length * 4; i += 3)
  {
    var triplet = (((binarray[i   >> 2] >> 8 * (3 -  i   %4)) & 0xFF) << 16)
                | (((binarray[i+1 >> 2] >> 8 * (3 - (i+1)%4)) & 0xFF) << 8 )
                |  ((binarray[i+2 >> 2] >> 8 * (3 - (i+2)%4)) & 0xFF);
    for(var j = 0; j < 4; j++)
    {
      if(i * 8 + j * 6 > binarray.length * 32) str += b64pad;
      else str += tab.charAt((triplet >> 6*(3-j)) & 0x3F);
    }
  }
  return str;
}


});

require.define("/node_modules/crypto-browserify/rng.js",function(require,module,exports,__dirname,__filename,process,global){// Original code adapted from Robert Kieffer.
// details at https://github.com/broofa/node-uuid
(function() {
  var _global = this;

  var mathRNG, whatwgRNG;

  // NOTE: Math.random() does not guarantee "cryptographic quality"
  mathRNG = function(size) {
    var bytes = new Array(size);
    var r;

    for (var i = 0, r; i < size; i++) {
      if ((i & 0x03) == 0) r = Math.random() * 0x100000000;
      bytes[i] = r >>> ((i & 0x03) << 3) & 0xff;
    }

    return bytes;
  }

  // currently only available in webkit-based browsers.
  if (_global.crypto && crypto.getRandomValues) {
    var _rnds = new Uint32Array(4);
    whatwgRNG = function(size) {
      var bytes = new Array(size);
      crypto.getRandomValues(_rnds);

      for (var c = 0 ; c < size; c++) {
        bytes[c] = _rnds[c >> 2] >>> ((c & 0x03) * 8) & 0xff;
      }
      return bytes;
    }
  }

  module.exports = whatwgRNG || mathRNG;

}())
});

require.define("/node_modules/crypto-browserify/md5.js",function(require,module,exports,__dirname,__filename,process,global){/*
 * A JavaScript implementation of the RSA Data Security, Inc. MD5 Message
 * Digest Algorithm, as defined in RFC 1321.
 * Version 2.2 Copyright (C) Paul Johnston 1999 - 2009
 * Other contributors: Greg Holt, Andrew Kepert, Ydnar, Lostinet
 * Distributed under the BSD License
 * See http://pajhome.org.uk/crypt/md5 for more info.
 */

/*
 * Configurable variables. You may need to tweak these to be compatible with
 * the server-side, but the defaults work in most cases.
 */
var hexcase = 0;   /* hex output format. 0 - lowercase; 1 - uppercase        */
var b64pad  = "";  /* base-64 pad character. "=" for strict RFC compliance   */

/*
 * These are the functions you'll usually want to call
 * They take string arguments and return either hex or base-64 encoded strings
 */
function hex_md5(s)    { return rstr2hex(rstr_md5(str2rstr_utf8(s))); }
function b64_md5(s)    { return rstr2b64(rstr_md5(str2rstr_utf8(s))); }
function any_md5(s, e) { return rstr2any(rstr_md5(str2rstr_utf8(s)), e); }
function hex_hmac_md5(k, d)
  { return rstr2hex(rstr_hmac_md5(str2rstr_utf8(k), str2rstr_utf8(d))); }
function b64_hmac_md5(k, d)
  { return rstr2b64(rstr_hmac_md5(str2rstr_utf8(k), str2rstr_utf8(d))); }
function any_hmac_md5(k, d, e)
  { return rstr2any(rstr_hmac_md5(str2rstr_utf8(k), str2rstr_utf8(d)), e); }

/*
 * Perform a simple self-test to see if the VM is working
 */
function md5_vm_test()
{
  return hex_md5("abc").toLowerCase() == "900150983cd24fb0d6963f7d28e17f72";
}

/*
 * Calculate the MD5 of a raw string
 */
function rstr_md5(s)
{
  return binl2rstr(binl_md5(rstr2binl(s), s.length * 8));
}

/*
 * Calculate the HMAC-MD5, of a key and some data (raw strings)
 */
function rstr_hmac_md5(key, data)
{
  var bkey = rstr2binl(key);
  if(bkey.length > 16) bkey = binl_md5(bkey, key.length * 8);

  var ipad = Array(16), opad = Array(16);
  for(var i = 0; i < 16; i++)
  {
    ipad[i] = bkey[i] ^ 0x36363636;
    opad[i] = bkey[i] ^ 0x5C5C5C5C;
  }

  var hash = binl_md5(ipad.concat(rstr2binl(data)), 512 + data.length * 8);
  return binl2rstr(binl_md5(opad.concat(hash), 512 + 128));
}

/*
 * Convert a raw string to a hex string
 */
function rstr2hex(input)
{
  try { hexcase } catch(e) { hexcase=0; }
  var hex_tab = hexcase ? "0123456789ABCDEF" : "0123456789abcdef";
  var output = "";
  var x;
  for(var i = 0; i < input.length; i++)
  {
    x = input.charCodeAt(i);
    output += hex_tab.charAt((x >>> 4) & 0x0F)
           +  hex_tab.charAt( x        & 0x0F);
  }
  return output;
}

/*
 * Convert a raw string to a base-64 string
 */
function rstr2b64(input)
{
  try { b64pad } catch(e) { b64pad=''; }
  var tab = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  var output = "";
  var len = input.length;
  for(var i = 0; i < len; i += 3)
  {
    var triplet = (input.charCodeAt(i) << 16)
                | (i + 1 < len ? input.charCodeAt(i+1) << 8 : 0)
                | (i + 2 < len ? input.charCodeAt(i+2)      : 0);
    for(var j = 0; j < 4; j++)
    {
      if(i * 8 + j * 6 > input.length * 8) output += b64pad;
      else output += tab.charAt((triplet >>> 6*(3-j)) & 0x3F);
    }
  }
  return output;
}

/*
 * Convert a raw string to an arbitrary string encoding
 */
function rstr2any(input, encoding)
{
  var divisor = encoding.length;
  var i, j, q, x, quotient;

  /* Convert to an array of 16-bit big-endian values, forming the dividend */
  var dividend = Array(Math.ceil(input.length / 2));
  for(i = 0; i < dividend.length; i++)
  {
    dividend[i] = (input.charCodeAt(i * 2) << 8) | input.charCodeAt(i * 2 + 1);
  }

  /*
   * Repeatedly perform a long division. The binary array forms the dividend,
   * the length of the encoding is the divisor. Once computed, the quotient
   * forms the dividend for the next step. All remainders are stored for later
   * use.
   */
  var full_length = Math.ceil(input.length * 8 /
                                    (Math.log(encoding.length) / Math.log(2)));
  var remainders = Array(full_length);
  for(j = 0; j < full_length; j++)
  {
    quotient = Array();
    x = 0;
    for(i = 0; i < dividend.length; i++)
    {
      x = (x << 16) + dividend[i];
      q = Math.floor(x / divisor);
      x -= q * divisor;
      if(quotient.length > 0 || q > 0)
        quotient[quotient.length] = q;
    }
    remainders[j] = x;
    dividend = quotient;
  }

  /* Convert the remainders to the output string */
  var output = "";
  for(i = remainders.length - 1; i >= 0; i--)
    output += encoding.charAt(remainders[i]);

  return output;
}

/*
 * Encode a string as utf-8.
 * For efficiency, this assumes the input is valid utf-16.
 */
function str2rstr_utf8(input)
{
  var output = "";
  var i = -1;
  var x, y;

  while(++i < input.length)
  {
    /* Decode utf-16 surrogate pairs */
    x = input.charCodeAt(i);
    y = i + 1 < input.length ? input.charCodeAt(i + 1) : 0;
    if(0xD800 <= x && x <= 0xDBFF && 0xDC00 <= y && y <= 0xDFFF)
    {
      x = 0x10000 + ((x & 0x03FF) << 10) + (y & 0x03FF);
      i++;
    }

    /* Encode output as utf-8 */
    if(x <= 0x7F)
      output += String.fromCharCode(x);
    else if(x <= 0x7FF)
      output += String.fromCharCode(0xC0 | ((x >>> 6 ) & 0x1F),
                                    0x80 | ( x         & 0x3F));
    else if(x <= 0xFFFF)
      output += String.fromCharCode(0xE0 | ((x >>> 12) & 0x0F),
                                    0x80 | ((x >>> 6 ) & 0x3F),
                                    0x80 | ( x         & 0x3F));
    else if(x <= 0x1FFFFF)
      output += String.fromCharCode(0xF0 | ((x >>> 18) & 0x07),
                                    0x80 | ((x >>> 12) & 0x3F),
                                    0x80 | ((x >>> 6 ) & 0x3F),
                                    0x80 | ( x         & 0x3F));
  }
  return output;
}

/*
 * Encode a string as utf-16
 */
function str2rstr_utf16le(input)
{
  var output = "";
  for(var i = 0; i < input.length; i++)
    output += String.fromCharCode( input.charCodeAt(i)        & 0xFF,
                                  (input.charCodeAt(i) >>> 8) & 0xFF);
  return output;
}

function str2rstr_utf16be(input)
{
  var output = "";
  for(var i = 0; i < input.length; i++)
    output += String.fromCharCode((input.charCodeAt(i) >>> 8) & 0xFF,
                                   input.charCodeAt(i)        & 0xFF);
  return output;
}

/*
 * Convert a raw string to an array of little-endian words
 * Characters >255 have their high-byte silently ignored.
 */
function rstr2binl(input)
{
  var output = Array(input.length >> 2);
  for(var i = 0; i < output.length; i++)
    output[i] = 0;
  for(var i = 0; i < input.length * 8; i += 8)
    output[i>>5] |= (input.charCodeAt(i / 8) & 0xFF) << (i%32);
  return output;
}

/*
 * Convert an array of little-endian words to a string
 */
function binl2rstr(input)
{
  var output = "";
  for(var i = 0; i < input.length * 32; i += 8)
    output += String.fromCharCode((input[i>>5] >>> (i % 32)) & 0xFF);
  return output;
}

/*
 * Calculate the MD5 of an array of little-endian words, and a bit length.
 */
function binl_md5(x, len)
{
  /* append padding */
  x[len >> 5] |= 0x80 << ((len) % 32);
  x[(((len + 64) >>> 9) << 4) + 14] = len;

  var a =  1732584193;
  var b = -271733879;
  var c = -1732584194;
  var d =  271733878;

  for(var i = 0; i < x.length; i += 16)
  {
    var olda = a;
    var oldb = b;
    var oldc = c;
    var oldd = d;

    a = md5_ff(a, b, c, d, x[i+ 0], 7 , -680876936);
    d = md5_ff(d, a, b, c, x[i+ 1], 12, -389564586);
    c = md5_ff(c, d, a, b, x[i+ 2], 17,  606105819);
    b = md5_ff(b, c, d, a, x[i+ 3], 22, -1044525330);
    a = md5_ff(a, b, c, d, x[i+ 4], 7 , -176418897);
    d = md5_ff(d, a, b, c, x[i+ 5], 12,  1200080426);
    c = md5_ff(c, d, a, b, x[i+ 6], 17, -1473231341);
    b = md5_ff(b, c, d, a, x[i+ 7], 22, -45705983);
    a = md5_ff(a, b, c, d, x[i+ 8], 7 ,  1770035416);
    d = md5_ff(d, a, b, c, x[i+ 9], 12, -1958414417);
    c = md5_ff(c, d, a, b, x[i+10], 17, -42063);
    b = md5_ff(b, c, d, a, x[i+11], 22, -1990404162);
    a = md5_ff(a, b, c, d, x[i+12], 7 ,  1804603682);
    d = md5_ff(d, a, b, c, x[i+13], 12, -40341101);
    c = md5_ff(c, d, a, b, x[i+14], 17, -1502002290);
    b = md5_ff(b, c, d, a, x[i+15], 22,  1236535329);

    a = md5_gg(a, b, c, d, x[i+ 1], 5 , -165796510);
    d = md5_gg(d, a, b, c, x[i+ 6], 9 , -1069501632);
    c = md5_gg(c, d, a, b, x[i+11], 14,  643717713);
    b = md5_gg(b, c, d, a, x[i+ 0], 20, -373897302);
    a = md5_gg(a, b, c, d, x[i+ 5], 5 , -701558691);
    d = md5_gg(d, a, b, c, x[i+10], 9 ,  38016083);
    c = md5_gg(c, d, a, b, x[i+15], 14, -660478335);
    b = md5_gg(b, c, d, a, x[i+ 4], 20, -405537848);
    a = md5_gg(a, b, c, d, x[i+ 9], 5 ,  568446438);
    d = md5_gg(d, a, b, c, x[i+14], 9 , -1019803690);
    c = md5_gg(c, d, a, b, x[i+ 3], 14, -187363961);
    b = md5_gg(b, c, d, a, x[i+ 8], 20,  1163531501);
    a = md5_gg(a, b, c, d, x[i+13], 5 , -1444681467);
    d = md5_gg(d, a, b, c, x[i+ 2], 9 , -51403784);
    c = md5_gg(c, d, a, b, x[i+ 7], 14,  1735328473);
    b = md5_gg(b, c, d, a, x[i+12], 20, -1926607734);

    a = md5_hh(a, b, c, d, x[i+ 5], 4 , -378558);
    d = md5_hh(d, a, b, c, x[i+ 8], 11, -2022574463);
    c = md5_hh(c, d, a, b, x[i+11], 16,  1839030562);
    b = md5_hh(b, c, d, a, x[i+14], 23, -35309556);
    a = md5_hh(a, b, c, d, x[i+ 1], 4 , -1530992060);
    d = md5_hh(d, a, b, c, x[i+ 4], 11,  1272893353);
    c = md5_hh(c, d, a, b, x[i+ 7], 16, -155497632);
    b = md5_hh(b, c, d, a, x[i+10], 23, -1094730640);
    a = md5_hh(a, b, c, d, x[i+13], 4 ,  681279174);
    d = md5_hh(d, a, b, c, x[i+ 0], 11, -358537222);
    c = md5_hh(c, d, a, b, x[i+ 3], 16, -722521979);
    b = md5_hh(b, c, d, a, x[i+ 6], 23,  76029189);
    a = md5_hh(a, b, c, d, x[i+ 9], 4 , -640364487);
    d = md5_hh(d, a, b, c, x[i+12], 11, -421815835);
    c = md5_hh(c, d, a, b, x[i+15], 16,  530742520);
    b = md5_hh(b, c, d, a, x[i+ 2], 23, -995338651);

    a = md5_ii(a, b, c, d, x[i+ 0], 6 , -198630844);
    d = md5_ii(d, a, b, c, x[i+ 7], 10,  1126891415);
    c = md5_ii(c, d, a, b, x[i+14], 15, -1416354905);
    b = md5_ii(b, c, d, a, x[i+ 5], 21, -57434055);
    a = md5_ii(a, b, c, d, x[i+12], 6 ,  1700485571);
    d = md5_ii(d, a, b, c, x[i+ 3], 10, -1894986606);
    c = md5_ii(c, d, a, b, x[i+10], 15, -1051523);
    b = md5_ii(b, c, d, a, x[i+ 1], 21, -2054922799);
    a = md5_ii(a, b, c, d, x[i+ 8], 6 ,  1873313359);
    d = md5_ii(d, a, b, c, x[i+15], 10, -30611744);
    c = md5_ii(c, d, a, b, x[i+ 6], 15, -1560198380);
    b = md5_ii(b, c, d, a, x[i+13], 21,  1309151649);
    a = md5_ii(a, b, c, d, x[i+ 4], 6 , -145523070);
    d = md5_ii(d, a, b, c, x[i+11], 10, -1120210379);
    c = md5_ii(c, d, a, b, x[i+ 2], 15,  718787259);
    b = md5_ii(b, c, d, a, x[i+ 9], 21, -343485551);

    a = safe_add(a, olda);
    b = safe_add(b, oldb);
    c = safe_add(c, oldc);
    d = safe_add(d, oldd);
  }
  return Array(a, b, c, d);
}

/*
 * These functions implement the four basic operations the algorithm uses.
 */
function md5_cmn(q, a, b, x, s, t)
{
  return safe_add(bit_rol(safe_add(safe_add(a, q), safe_add(x, t)), s),b);
}
function md5_ff(a, b, c, d, x, s, t)
{
  return md5_cmn((b & c) | ((~b) & d), a, b, x, s, t);
}
function md5_gg(a, b, c, d, x, s, t)
{
  return md5_cmn((b & d) | (c & (~d)), a, b, x, s, t);
}
function md5_hh(a, b, c, d, x, s, t)
{
  return md5_cmn(b ^ c ^ d, a, b, x, s, t);
}
function md5_ii(a, b, c, d, x, s, t)
{
  return md5_cmn(c ^ (b | (~d)), a, b, x, s, t);
}

/*
 * Add integers, wrapping at 2^32. This uses 16-bit operations internally
 * to work around bugs in some JS interpreters.
 */
function safe_add(x, y)
{
  var lsw = (x & 0xFFFF) + (y & 0xFFFF);
  var msw = (x >> 16) + (y >> 16) + (lsw >> 16);
  return (msw << 16) | (lsw & 0xFFFF);
}

/*
 * Bitwise rotate a 32-bit number to the left.
 */
function bit_rol(num, cnt)
{
  return (num << cnt) | (num >>> (32 - cnt));
}


exports.hex_md5 = hex_md5;
exports.b64_md5 = b64_md5;
exports.any_md5 = any_md5;

});

require.define("libotr4.js",function(require,module,exports,__dirname,__filename,process,global){
var otrModule = ti_require('tiotrmodule');
var BigInt = require('./bigint');

var OtrlConnContext;
var OpsEvent;

var _static_buffer_ptr = otrModule.CallMalloc(4096);
var _static_new_mpi_ptr_ptr = otrModule.CallMalloc(4);

otrModule.setup_ops_callback(function(){
    var evname = arguments[0];
    var opdata = arguments[1];
    var ctx;
    switch (evname){
        case 'policy': return OpsEvent(opdata,{},evname);

        case 'create_privkey':
            return OpsEvent(opdata,{
                "accountname": arguments[2],
                "protocol": arguments[3]
            },evname);

        case 'is_logged_in': return OpsEvent(opdata,{},evname);

        case 'inject_message': return OpsEvent(opdata,{
                "message": arguments[5]
            },evname);

        case  'update_context_list': return OpsEvent(opdata,{},evname);

        case  'fingerprint': return OpsEvent(opdata,{fingerprint:arguments[6]},evname);

        case  'write_fingerprints': return OpsEvent(opdata,{},evname);

        case  'gone_secure': return OpsEvent(opdata,{},evname);

        case  'still_secure': return OpsEvent(opdata,{
                "is_reply":arguments[3]
            },evname);

        case  'gone_insecure': return OpsEvent(opdata,{},evname);

        case  'max_message_size': return OpsEvent(opdata,{},evname);

        case  'received_symkey': return OpsEvent(opdata,{
                "use": arguments[3],
                "usedata":ptr_to_ArrayBuffer(arguments[4],arguments[5]),
                "key":ptr_to_ArrayBuffer(arguments[6],32)
            },evname);

        case  'msg_event': return OpsEvent(opdata,{
                "event":arguments[2],
                "message":arguments[4],
                "err": (arguments[5]? new GcryptError(arguments[5]):null)
            },evname);

        case  'create_instag': return OpsEvent(opdata,{
                "accountname": arguments[2],
                "protocol": arguments[3]
            },evname);

        case  'smp_request': 
            ctx = new OtrlConnContext(arguments[2]);
            if(arguments[3]!=0) ctx["question"] = arguments[3];
            return OpsEvent(opdata,ctx,evname);
        case  'smp_failed': 
        case  'smp_aborted':
        case  'smp_complete':
        case  'smp_error':
                ctx = new OtrlConnContext(arguments[2]);
                return OpsEvent(opdata,{},evname);

    }
});

var libotr4js = module.exports = {
  getModule : function(){
        return libotr4js;
  },
  init: function(F){
        OtrlConnContext = F.OtrlConnContext;
        OpsEvent = F.OpsEvent;
  },
  malloc      : function(){return otrModule.CallMalloc.apply(otrModule,arguments);},
  free        : function(){return otrModule.CallFree.apply(otrModule,arguments);},
  getValue    : getValue,
  setValue    : setValue,
  Pointer_stringify : function(){return otrModule.CallStringify.apply(otrModule,arguments);},

  helper: {
    mpi2bigint : mpi2bigint,
    bigint2mpi : bigint2mpi,
    ptr_to_ArrayBuffer : ptr_to_ArrayBuffer,
    ptr_to_HexString : ptr_to_HexString,
    unsigned_char : unsigned_char,
    unsigned_int32 : unsigned_int32,
    str2ab :    str2ab,
    ab2str : ab2str
  },
  libotrl:{
    version : function(){return otrModule.CallOtrlVersion.apply(otrModule,arguments);},
    userstate_create : function(){return otrModule.CallOtrlUserstateCreate.apply(otrModule,arguments);},
    userstate_free : function(){return otrModule.CallOtrlUserstateFree.apply(otrModule,arguments);},
    privkey_read : function(){return otrModule.CallOtrlPrivkeyRead.apply(otrModule,arguments);},
    privkey_fingerprint: function(){return otrModule.CallOtrlPrivkeyFingerprint.apply(otrModule,arguments);},
    privkey_generate: function(){return otrModule.CallOtrlPrivkeyGenerate.apply(otrModule,arguments);},
    privkey_read_fingerprints : function(){return otrModule.CallOtrlPrivkeyReadFingerprints.apply(otrModule,arguments);},
    privkey_write_fingerprints : function(){return otrModule.CallOtrlPrivkeyWriteFingerprints.apply(otrModule,arguments);},
    privkey_forget : function(){return otrModule.CallOtrlPrivkeyForget.apply(otrModule,arguments);},
    privkey_forget_all : function(){return otrModule.CallOtrlPrivkeyForgetAll.apply(otrModule,arguments);},
    privkey_find : function(){return otrModule.CallOtrlPrivkeyFind.apply(otrModule,arguments);},
    context_find : function(){return otrModule.CallOtrlContextFind.apply(otrModule,arguments);},
    message_sending : function(){return otrModule.CallOtrlMessageSending.apply(otrModule,arguments);},
    message_receiving : function(){return otrModule.CallOtrlMessageReceiving.apply(otrModule,arguments);},
    message_free : function(){return otrModule.CallOtrlMessageFree.apply(otrModule,arguments);},
    message_disconnect : function(){return otrModule.CallOtrlMessageDisconnect.apply(otrModule,arguments);},
    message_disconnect_all_instances : function(){return otrModule.CallOtrlMessageDisconnectAllInstances.apply(otrModule,arguments);},
    message_initiate_smp : function(){return otrModule.CallOtrlMessageInitiateSmp.apply(otrModule,arguments);},
    message_initiate_smp_q :function(){return otrModule.CallOtrlMessageInitiateSmpQ.apply(otrModule,arguments);},
    message_respond_smp : function(){return otrModule.CallOtrlMessageRespondSmp.apply(otrModule,arguments);},
    message_abort_smp : function(){return otrModule.CallOtrlMessageAbortSmp.apply(otrModule,arguments);},
    message_symkey : function(){return otrModule.CallOtrlMessageSymkey.apply(otrModule,arguments);},
    instag_find : function(){return otrModule.CallOtrlInstagFind.apply(otrModule,arguments);},
    instag_read : function(){return otrModule.CallOtrlInstagRead.apply(otrModule,arguments);},
    instag_write: function(){return otrModule.CallOtrlInstagWrite.apply(otrModule,arguments);},
    instag_generate : function(){return otrModule.CallOtrlInstagGenerate.apply(otrModule,arguments);},
    tlv_free : function(){return otrModule.CallOtrlTlvFree.apply(otrModule,arguments);},
    tlv_find : function(){return otrModule.CallOtrlTlvFind.apply(otrModule,arguments);}    
  },

  libgcrypt:{
        strerror : function(){return otrModule.CallGcryStrerror.apply(otrModule,arguments);},
        mpi_new: function(){return otrModule.CallGcryMpiNew.apply(otrModule,arguments);},
        mpi_set: function(){return otrModule.CallGcryMpiSet.apply(otrModule,arguments);},
        mpi_release: function(){return otrModule.CallGcryMpiRelease.apply(otrModule,arguments);},
        mpi_print: function(){return otrModule.CallGcryMpiPrint.apply(otrModule,arguments);},
        mpi_scan: function(){return otrModule.CallGcryMpiScan.apply(otrModule,arguments);}
  },
    
  jsapi:{
    userstate_get_privkey_root : function(){return otrModule.CallJsapiUserstateGetPrivkeyRoot.apply(otrModule,arguments);},
    userstate_get_privkey_next : function(){return otrModule.CallJsapiUserstateGetPrivkeyNext.apply(otrModule,arguments);},
    userstate_get_privkey_accountname: function(){return otrModule.CallJsapiUserstateGetPrivkeyAccountname.apply(otrModule,arguments);},
    userstate_get_privkey_accountname: function(){return otrModule.CallJsapiPrivkeyGetProtocol.apply(otrModule,arguments);},
    privkey_write_trusted_fingerprints: function(){return otrModule.CallJsapiPrivkeyWriteTrustedFingerprints.apply(otrModule,arguments);},
    userstate_write_to_file : function(){return otrModule.CallJsapiUserstateWriteToFile.apply(otrModule,arguments);},
    privkey_delete: function(){return otrModule.CallJsapiPrivkeyDelete.apply(otrModule,arguments);},
    privkey_get_dsa_token: function(){return otrModule.CallJsapiPrivkeyGetDsaToken.apply(otrModule,arguments);},
    userstate_import_privkey: function(){return otrModule.CallJsapiUserstateImportPrivkey.apply(otrModule,arguments);},
    conncontext_get_protocol: function(){return otrModule.CallJsapiConncontextGetProtocol.apply(otrModule,arguments);},
    conncontext_get_username: function(){return otrModule.CallJsapiConncontextGetUsername.apply(otrModule,arguments);},
    conncontext_get_accountname: function(){return otrModule.CallJsapiConncontextGetAccountname.apply(otrModule,arguments);},
    conncontext_get_msgstate: function(){return otrModule.CallJsapiConncontextGetMsgstate.apply(otrModule,arguments);},
    conncontext_get_protocol_version: function(){return otrModule.CallJsapiConncontextGetProtocolVersion.apply(otrModule,arguments);},
    conncontext_get_sm_prog_state: function(){return otrModule.CallJsapiConncontextGetSmProgState.apply(otrModule,arguments);},
    conncontext_get_active_fingerprint: function(){return otrModule.CallJsapiConncontextGetActiveFingerprint.apply(otrModule,arguments);},
    conncontext_get_trust: function(){return otrModule.CallJsapiConncontextGetTrust.apply(otrModule,arguments);},
    conncontext_get_their_instance: function(){return otrModule.CallJsapiConncontextGetTheirInstance.apply(otrModule,arguments);},
    conncontext_get_our_instance: function(){return otrModule.CallJsapiConncontextGetOurInstance.apply(otrModule,arguments);},
    conncontext_get_master: function(){return otrModule.CallJsapiConncontextGetMaster.apply(otrModule,arguments);},
    instag_get_tag: function(){return otrModule.CallJsapiInstagGetTag.apply(otrModule,arguments);},
    can_start_smp: function(){return otrModule.CallJsapiCanStartSmp.apply(otrModule,arguments);},
    messageappops_new : function(){return otrModule.CallJsapiMessageappopsNew.apply(otrModule,arguments);},
    initialise:function(){}
  }
}

function getValue(ptr,type){
        switch (type){
            case 'i8':  return otrModule.DoGetValueInt8(ptr);
            case 'i16': return otrModule.CallGetValueInt16(ptr);
            case 'i32': return otrModule.CallGetValueInt32(ptr);
        }
}

function setValue(ptr,value,type){
        switch(type){
            case 'i8': otrModule.DoSetValueInt8(ptr,value);return;
            case 'i16':otrModule.DoSetValueInt16(ptr,value);return;
            case 'i32':otrModule.DoSetValueInt32(ptr,value);return;
        }
}

var gcry_ = libotr4js.libgcrypt;
    
function mpi2bigint(mpi_ptr){
    var GCRYMPI_FMT_HEX = 4; 
    var err = gcry_.mpi_print(GCRYMPI_FMT_HEX,_static_buffer_ptr,4096,0,mpi_ptr);

    if(err) {
        throw new GcryptError(err);
    }
    var mpi_str_ptr = _static_buffer_ptr;
    var mpi_str = otrModule.CallStringify(mpi_str_ptr);

    return BigInt.str2bigInt(mpi_str,16);
}

function bigint2mpi(mpi_ptr,bi_num){
    var new_mpi_ptr_ptr = _static_new_mpi_ptr_ptr;
    var bi_num_str = BigInt.bigInt2str(bi_num,16);
    var err = gcry_.mpi_scan(new_mpi_ptr_ptr,4,bi_num_str,0,0);
    if(err){
        throw new GcryptError(err);
    }
    var scanned_mpi_ptr = getValue(new_mpi_ptr_ptr,"i32");
    if(scanned_mpi_ptr==0){
        throw("NULL scanned MPI in __bigint2mpi() otr_pre.js");
    }
    var same = gcry_.mpi_set(mpi_ptr,scanned_mpi_ptr);

    gcry_.mpi_release(scanned_mpi_ptr);
    if(same && same != mpi_ptr){
        return same;
    }        
}

function GcryptError( num ) {
    this.num = num || 0;
    this.message = gcry_.strerror(num || 0);
}

GcryptError.prototype = new Error();
GcryptError.prototype.constructor = GcryptError;

var hexDigit = ['0','1','2','3','4','5','6','7','8','9','A','B','C','D','E','F'];

function hexString( val ){
    return hexDigit[(val & 0xF0) >> 4] + hexDigit[val & 0x0F];
}

function ptr_to_HexString(ptr,len){     
    var hex = "";
    for(var i=0; i<len; i++){
        hex = hex + hexString( unsigned_char( getValue( ptr + i,"i8")));
    }
    return hex;
}

function ptr_to_ArrayBuffer(ptr,len){
    var buf = new ArrayBuffer(len);
    var u8 = new Uint8Array(buf);
    for(var i=0; i<len; i++){
        u8[i]= unsigned_char( getValue( ptr + i,"i8"));
    }
    return buf;    
}

function unsigned_char( c ){
    c = c & 0xFF;
    return ( c < 0 ? (0xFF+1)+c : c );
} 

function unsigned_int32( i ){
    //i must be in the range of a signed 32-bit integer!
    i = i & 0xFFFFFFFF;//truncate so we don't return values larger than an unsigned 32-bit integer
    return ( i < 0 ? (0xFFFFFFFF+1)+i : i );
}

// http://updates.html5rocks.com/2012/06/How-to-convert-ArrayBuffer-to-and-from-String
function ab2str(buf) {
  var u16 = new Uint16Array(buf);
  return String.fromCharCode.apply(null, u16);
}

function str2ab(str) {
  var buf = new ArrayBuffer(str.length*2); // 2 bytes for each char
  var bufView = new Uint16Array(buf);
  for (var i=0, strLen=str.length; i<strLen; i++) {
    bufView[i] = str.charCodeAt(i);
  }
  return buf;
}

});

require.define("libotr-js-bindings.js",function(require,module,exports,__dirname,__filename,process,global){;(function () {

  var root = this;

/*
 *  Off-the-Record Messaging bindings for node/javascript
 *  Copyright (C) 2012  Mokhtar Naamani,
 *                      <mokhtar.naamani@gmail.com>
 *
 *  This program is free software; you can redistribute it and/or modify
 *  it under the terms of version 2 of the GNU General Public License as
 *  published by the Free Software Foundation.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with this program; if not, write to the Free Software
 *  Foundation, Inc., 59 Temple Place, Suite 330, Boston, MA  02111-1307  USA
 */

  var libModule, ASYNC, fs, path, BigInt;

  if (typeof exports !== 'undefined') {
    libModule = require("./libotr4.js").getModule();
    ASYNC = require("./async");
    fs = require("fs");
    path = require("path");
    BigInt = require("./bigint.js");
    module.exports = otrBindings;

  } else {
    libModule = root.getModule();
    ASYNC = root.async;
    fs = undefined;//local storage?
    BigInt = root.BigInt;
    root.otrBindings = otrBindings;
  }

var otrl_ = libModule.libotrl; //cwrap()'ed functions from libotr
var gcry_ = libModule.libgcrypt; //cwrap()'ed functions from libgcrypt
var jsapi_= libModule.jsapi;
var helper_ = libModule.helper;

var _malloc = libModule.malloc;
var _free = libModule.free;
var getValue = libModule.getValue;
var setValue = libModule.setValue;
var Pointer_stringify = libModule.Pointer_stringify;

if(libModule.init){
    libModule.init({OpsEvent:ops_event, OtrlConnContext:OtrlConnContext});
}else{
    libModule["ops_event"] = ops_event;
    libModule["ConnContext"] = OtrlConnContext;
}

var OPS_QUEUE;
var MAO = []; //OtrlMessageAppOps instances and their callback handlers

//otrBindings = Exported Interface
function otrBindings(){
    this.init();
};

otrBindings.prototype = {

    constructor: otrBindings,

    init : jsapi_.initialise, //put this in jsapi.c main() instead?

    UserState : OtrlUserState,

    ConnContext : OtrlConnContext,

    MessageAppOps : OtrlMessageAppOps,

    VFS : VirtualFileSystem,

    version :function(){
        return otrl_.version()+"-emscripten";
    },

    GcryptError: GcryptError    
};

var OTRL_TLV_DISCONNECTED = 1;

//OtrlTLV
function OtrlTLV(ptr){
    this._pointer = ptr;
};
OtrlTLV.prototype.find = function(type){
    return this._pointer?otrl_.tlv_find(this._pointer,type) : undefined;
};
OtrlTLV.prototype.free = function(){
    if(this._pointer){
        otrl_.tlv_free(this._pointer);
        this._pointer = 0;
    }
};
//OtrlInsTag
function OtrlInsTag(ptr){
    this._pointer = ptr;
};
OtrlInsTag.prototype.instag = function(){
    return helper_.unsigned_int32(jsapi_.instag_get_tag(this._pointer));
};

//OtrlPrivKey
function OtrlPrivKey(ptr){
    this._pointer = ptr;
};
OtrlPrivKey.prototype.next = function(){
    var ptr = jsapi_.privkey_get_next(this._pointer);
    if(ptr) return new OtrlPrivKey(ptr);
    return null;
};
OtrlPrivKey.prototype.accountname = function(){
    return jsapi_.privkey_get_accountname(this._pointer);
};
OtrlPrivKey.prototype.protocol = function(){
    return jsapi_.privkey_get_protocol(this._pointer);
};
OtrlPrivKey.prototype.forget = function(){
    otrl_.privkey_forget(this._pointer);
    this._pointer = 0;
};
OtrlPrivKey.prototype.export = function( format ){
    var self = this;
    var buffer = _malloc(1024);
    var nbytes_ptr = _malloc(4);
    var nbytes = 0;    
    var dsakey = {};
    var err = 0;
    ['p','q','g','y','x'].forEach(function(token){
        err = jsapi_.privkey_get_dsa_token(self._pointer,token,buffer,1024,nbytes_ptr);
        if(err){
            _free(buffer);
            _free(nbytes_ptr);
            throw( new GcryptError(err) );
            console.error("error exporting key:", gcry_.strerror(err) );
        }else{
            nbytes = getValue(nbytes_ptr);
            if(nbytes){
                dsakey[token] = Pointer_stringify( buffer );
            }
        }
    });
    _free(buffer);
    _free(nbytes_ptr);

    if(format == "BIGINT") {
        ['p','q','g','y','x'].forEach(function(token){
            dsakey[token] = BigInt.str2bigInt( dsakey[token], 16);
        });
    }
    dsakey.type = '\u0000\u0000';

    return dsakey;
};
OtrlPrivKey.prototype.exportPublic = function( format ){
    var key = this.export(format);
    if(key){
        delete key.x;
        return key;
    }
}
OtrlPrivKey.prototype.toString = function(){
    return this.exportPublic("HEX");
};


//OtrlUserState
function OtrlUserState(){
    this._pointer = otrl_.userstate_create();
};
OtrlUserState.prototype.free = function(){
    otrl_.userstate_free(this._pointer);
};
OtrlUserState.prototype.privkey_root = function(){
    var ptr=jsapi_.userstate_get_privkey_root(this._pointer);
    if(ptr) return new OtrlPrivKey(ptr);
    return undefined;
};
OtrlUserState.prototype.accounts = function(){
    var p = this.privkey_root();
    var accounts = [];
    var accountname,protocol;
    var self = this;
    while(p){
        accountname = p.accountname();
        protocol = p.protocol();
        accounts.push({            
            "accountname":accountname,
            "protocol":protocol,
            "fingerprint":self.fingerprint(accountname,protocol),
            "privkey":p,
            "instag":self.findInstag(accountname,protocol)
        });
        p = p.next();
    }
    return accounts;
};
OtrlUserState.prototype.generateKey = function(filename,accountname,protocol,callback){    
    var self = this;
    if(typeof filename == 'string' && typeof accountname=='string' && typeof protocol=='string' && typeof callback == 'function'){
      var err = otrl_.privkey_generate(this._pointer,filename,accountname,protocol);
      try{
        callback.apply(self, [err ? new GcryptError(err) : null, err? undefined:this.findKey(accountname,protocol)]);
      }catch(e){
        console.error("Fatal Exception -",e);
      }
    }else{
        throw("invalid arguments to generateKey()");
    }
};
OtrlUserState.prototype.fingerprint = function(accountname, protocol){
    if( typeof accountname =='string' && typeof protocol == 'string'){
        var fp = _malloc(45);
        var res = otrl_.privkey_fingerprint(this._pointer,fp,accountname,protocol);
        var human = (res? Pointer_stringify(fp):undefined);
        _free(fp);
        return human;
    }else{
        throw("invalid arguments to fingerprint()");
    }
};
OtrlUserState.prototype.readKeysSync = function(filename){
    if(typeof filename=='string'){
        var err = otrl_.privkey_read(this._pointer,filename);
        if(err) throw( new GcryptError(err) );
    }else{
        throw("invalid arguments to readKeysSync()");
    }
};
OtrlUserState.prototype.writeKeysSync = function(filename){
    if(typeof filename=='string'){
        var err = jsapi_.userstate_write_to_file(this._pointer,filename);
        if(err) throw( new GcryptError(err) );
    }else{
        throw("invalid arguments to writeKeysSync()");
    }
};
OtrlUserState.prototype.readFingerprintsSync = function(filename){
    if(typeof filename == 'string'){
        var err = otrl_.privkey_read_fingerprints(this._pointer,filename,0,0);
        if(err) throw( new GcryptError(err) );
    }else{
        throw("invalid arguments to readFingerprintsSync()");
    }
};
OtrlUserState.prototype.writeFingerprintsSync = function (filename){
    if(typeof filename == 'string'){    
        var err = otrl_.privkey_write_fingerprints(this._pointer,filename);
        if(err) throw( new GcryptError(err) );
    }else{
        throw("invalid arguments to writeFingerprintsSync()");
    }
};
OtrlUserState.prototype.writeTrustedFingerprintsSync = function (filename){
    if(typeof filename == 'string'){    
        var err = jsapi_.privkey_write_trusted_fingerprints(this._pointer,filename);
        if(err) throw( new GcryptError(err) );
    }else{
        throw("invalid arguments to writeTrustedFingerprintsSync()");
    }
};
OtrlUserState.prototype.readInstagsSync = function(filename){
    if(typeof filename == 'string'){
        var err = otrl_.instag_read(this._pointer,filename);
        if(err) throw( new GcryptError(err) );
    }else{
        throw("invalid arguments to readInstagsSync()");
    }
};
OtrlUserState.prototype.writeInstagsSync = function(filename){
    if(typeof filename == 'string'){
        var err = otrl_.instag_write(this._pointer,filename);
        if(err) throw( new GcryptError(err) );
    }else{
        throw("invalid arguments to writeInstagsSync()");
    }
};

OtrlUserState.prototype.readKeys = function(){
    throw("use 'readKeysSync()' not 'readKeys()'");
};
OtrlUserState.prototype.readFingerprints = function (){
    throw("use 'readFingerprintsSync()' not 'readFingerprints()'");
};
OtrlUserState.prototype.writeFingerprints = function (){
    throw("use 'writeFingerprintsSync' not 'writeFingerprints()'");
};
OtrlUserState.prototype.generateInstag = function (filename,accountname,protocol){
   if(typeof filename == 'string' &&
      typeof accountname == 'string' &&
      typeof protocol == 'string'
   ){    
        var err = otrl_.instag_generate(this._pointer,filename, accountname,protocol);
        if(err) throw( new GcryptError(err) );
    }else{
        throw("invalid arguments to generateInstag()");
    }
};
OtrlUserState.prototype.findInstag = function (accountname,protocol){
   if(typeof accountname == 'string' &&
      typeof protocol == 'string'
   ){    
        var ptr = otrl_.instag_find(this._pointer,accountname,protocol);
        if(ptr) return (new OtrlInsTag(ptr)).instag();
        return undefined;
    }else{
        throw("invalid arguments to findInstag()");
    }
};
OtrlUserState.prototype.findKey = function(accountname,protocol){
    var ptr = otrl_.privkey_find(this._pointer,accountname,protocol);
    if(ptr) return new OtrlPrivKey(ptr);
    return null;
};
OtrlUserState.prototype.forgetAllKeys = function(){
    otrl_.privkey_forget_all(this._pointer);
};
OtrlUserState.prototype.deleteKeyOnFile = function(filename,accountname,protocol){   
    jsapi_.privkey_delete(this._pointer,filename,accountname,protocol);        
};
OtrlUserState.prototype.importKey = function (accountname,protocol,dsa,base){
    var err = 0;
    var mpi = {
        p: gcry_.mpi_new ( 1024 ),
        q: gcry_.mpi_new ( 1024 ),
        g: gcry_.mpi_new ( 1024 ),
        y: gcry_.mpi_new ( 1024 ),
        x: gcry_.mpi_new ( 1024 )
    };
    var doImport=true;
    ['p','q','g','y','x'].forEach(function(t){
        var bi;
        switch( typeof dsa[t] ){
            case 'string':
                bi = BigInt.str2bigInt(dsa[t],base || 16);
                break;
            case 'object':
                bi = dsa[t];
                break;
            default:
                doImport = false;
                bi = null;
        }
        if(bi!=null) {
            //console.log("converting BI to mpi:",bi);
            helper_.bigint2mpi(mpi[t],bi);
        } 
    });
    if( doImport ) {
      //console.log("importing mpi:",mpi);
      err = jsapi_.userstate_import_privkey(this._pointer,accountname,protocol, mpi.p, mpi.q, mpi.g, mpi.y, mpi.x );
      //console.log( "import result:", gcry_.strerror(err));      
    }

    ['p','q','g','y','x'].forEach(function(t){
        gcry_.mpi_release(mpi[t]);
    });
    if(doImport && err) throw new GcryptError(err);    
    if(!doImport) throw new Error("DSA Key import failed. Unsupported Format.");
}

//ConnContext
function OtrlConnContext(userstate,accountname,protocol,recipient){
    if( typeof userstate == 'object' &&
        typeof accountname == 'string' &&
        typeof protocol == 'string' &&
        typeof recipient == 'string' ){

        var addedp_addr = _malloc(4); //allocate(1, "i32", ALLOC_STACK);
        var instag = 0;//OTRL_INSTAG_MASTER
        this._pointer = otrl_.context_find(userstate._pointer,recipient,accountname,protocol,instag,1,addedp_addr,0,0);
        _free(addedp_addr);
    }else{
        if(arguments.length==1 && typeof arguments[0]=='number'){
            //assume arguments[0] == pointer to existing context;
            this._pointer = arguments[0];
        }else{
            throw("invalid arguments to OtrlConnContext()");
        }
    }
};

OtrlConnContext.prototype.protocol = function(){
    return jsapi_.conncontext_get_protocol(this._pointer);
};
OtrlConnContext.prototype.username = function(){
    return jsapi_.conncontext_get_username(this._pointer);
};
OtrlConnContext.prototype.accountname = function(){
    return jsapi_.conncontext_get_accountname(this._pointer);
};
OtrlConnContext.prototype.msgstate = function(){
    return jsapi_.conncontext_get_msgstate(this._pointer);
};
OtrlConnContext.prototype.protocol_version = function(){
    return jsapi_.conncontext_get_protocol_version(this._pointer);
};
OtrlConnContext.prototype.smstate = function(){
    return jsapi_.conncontext_get_smstate(this._pointer);
};
OtrlConnContext.prototype.fingerprint = function(){
    var fp = _malloc(45);
    jsapi_.conncontext_get_active_fingerprint(this._pointer,fp);
    var human =  Pointer_stringify(fp);
    _free(fp);
    return human;
};
OtrlConnContext.prototype.trust = function(){
    return jsapi_.conncontext_get_trust(this._pointer);
};
OtrlConnContext.prototype.their_instance = function(){
    return helper_.unsigned_int32(jsapi_.conncontext_get_their_instance(this._pointer));
};
OtrlConnContext.prototype.our_instance = function(){
    return helper_.unsigned_int32( jsapi_.conncontext_get_our_instance(this._pointer));
};
OtrlConnContext.prototype.master = function(){
    return new OtrlConnContext( jsapi_.conncontext_get_master(this._pointer));
};
OtrlConnContext.prototype.obj = function(){
    return({
        'protocol':this.protocol(),
        'username':this.username(),
        'accountname':this.accountname(),
        'msgstate':this.msgstate(),
        'protocol_version':this.protocol_version(),
        'smstate':this.smstate(),
        'fingerprint':this.fingerprint(),
        'trust':this.trust(),
        'their_instance':this.their_instance(),
        'our_instance':this.our_instance()
    });
};
OtrlConnContext.prototype.fields = OtrlConnContext.prototype.obj;

//OtrlMessageAppOps
function OtrlMessageAppOps( event_handler ){
    //keep track of all created instances
    //index into array will be passed around as opdata to tie
    //the event_handler to the relevant instance.
    if(!OPS_QUEUE) OPS_QUEUE = ASYNC.queue(ops_handle_event,1)

    var self = this;   
    this._event_handler = event_handler;
    this._opsdata = _malloc(4);
    setValue(this._opsdata,MAO.length,"i32");
    MAO[MAO.length] = {"instance":self};
    this._pointer = jsapi_.messageappops_new();
};

function ops_handle_event(O,callback){
    var instance = O._;
    delete O._;
    instance._event_handler(O);
    callback();
}

function ops_event($opsdata, ev_obj, ev_name){
  var $index = getValue($opsdata,"i32");
  if(ev_name) ev_obj.EVENT = ev_name;
  var event_handled = false;
  var ret_value;

  //handle ops synchronously
  ['is_logged_in','policy','max_message_size','create_instag','create_privkey','new_fingerprint','write_fingerprints'].forEach(function(E){
      if(ev_name == E){
        event_handled = true;
        ret_value = MAO[$index].instance._event_handler(ev_obj);
      }
  });

  if(event_handled){
    return ret_value;
  }else{
      //fire events asynchronously
      ev_obj._ = MAO[$index].instance;
      OPS_QUEUE.push(ev_obj);
  }
}

OtrlMessageAppOps.prototype.messageSending = function(userstate,accountname,protocol,recipient,message, to_instag, otrchannel){
    if(!(
        typeof userstate=='object' &&
        typeof accountname=='string' &&
        typeof protocol=='string' &&
        typeof recipient=='string' &&
        typeof message=='string'
    )){
        throw("invalid arguments to messageSending()");
    }
    var messagep_ptr = _malloc(4);//char**
    setValue(messagep_ptr,0,"i32");

    //var frag_policy = 1;//OTRL_FRAGMENT_SEND_ALL
    var frag_policy = 0;//OTRL_FRAGMENT_SEND_SKIP
    var contextp_ptr = _malloc(4);//pointer to context used to send to buddy
    var instag = to_instag || 1;//OTRL_INSTAG_BEST
    //var instag = 0;//OTRL_INSTAG_MASTER

    var err = otrl_.message_sending(userstate._pointer,this._pointer,this._opsdata,accountname,protocol,recipient,instag,
                message,0,messagep_ptr,frag_policy,contextp_ptr,0,0);    

    //update the channel with the active context used 
    otrchannel.context._pointer = getValue(contextp_ptr,"i32");

    var retvalue;
    if(err == 0 ){
        var messagep = getValue(messagep_ptr,"i32");
        if(messagep != 0 && frag_policy != 1 ){ 
            //we will handle sending the encrypted fragment
            retvalue = Pointer_stringify(messagep);
        }
    }else{
        //encryption error occured (msg_event will be fired)
    }
    if(messagep != 0) otrl_.message_free(messagep);

    _free(messagep_ptr);
    _free(contextp_ptr);
    return retvalue;

};
OtrlMessageAppOps.prototype.messageReceiving = function(userstate,accountname,protocol,sender,message, otrchannel){
    if(!(
        typeof userstate=='object' &&
        typeof accountname=='string' &&
        typeof protocol=='string' &&
        typeof sender=='string' &&
        typeof message=='string'
    )){
        throw("invalid arguments to messageReceiving()");
    }
    var contextp_ptr = _malloc(4);//pointer to context of buddy used to receive the message
    var newmessagep_ptr = _malloc(4); //char**
    var tlvsp_ptr = _malloc(4)//OtrlTLV**
    var status = otrl_.message_receiving(userstate._pointer, this._pointer, this._opsdata,
           accountname, protocol, sender, message, newmessagep_ptr, tlvsp_ptr,contextp_ptr,0,0);

    //update the channel with the active context used 
    otrchannel.context._pointer = getValue(contextp_ptr,"i32");

    var tlvs = new OtrlTLV( getValue(tlvsp_ptr,"i32") );
    if(tlvs.find(OTRL_TLV_DISCONNECTED)){
        ops_event(this._opsdata,{}, "remote_disconnected");
    }
    tlvs.free();

	var newmessagep = getValue(newmessagep_ptr,"i32");//char*

    var retvalue;
    if(status==1) retvalue = null;
    if(status==0) {
        retvalue = (newmessagep==0) ? message : Pointer_stringify(newmessagep);
    }
    if(newmessagep!=0) otrl_.message_free(newmessagep);

    _free(tlvsp_ptr);
    _free(newmessagep_ptr);
    _free(contextp_ptr);

    return retvalue;
};
OtrlMessageAppOps.prototype.disconnect = function(userstate,accountname,protocol,recipient,instag){
    if(!(
        typeof userstate=='object' &&
        typeof accountname=='string' &&
        typeof protocol=='string' &&
        typeof recipient=='string'
    )){
        throw("invalid arguments to disconnect()");
    }

    otrl_.message_disconnect(userstate._pointer,this._pointer,this._opsdata, accountname,protocol,recipient,instag);  
};
OtrlMessageAppOps.prototype.initSMP = function(userstate,context,secret,question){
    if(!(
        typeof userstate=='object' &&
        typeof context=='object' &&
        typeof secret=='string'
    )){
        throw("invalid arguments to initSMP()");
    }

    if(jsapi_.can_start_smp(context._pointer)){
        if(question){
            otrl_.message_initiate_smp_q(userstate._pointer,this._pointer,this._opsdata,context._pointer,question,secret,secret.length);
        }else{
            otrl_.message_initiate_smp(userstate._pointer,this._pointer,this._opsdata,context._pointer,secret,secret.length);
        }
    }
};
OtrlMessageAppOps.prototype.respondSMP = function(userstate,context,secret){
    if(!(
        typeof userstate=='object' &&
        typeof context=='object' &&
        typeof secret=='string' 
    )){
        throw("invalid arguments to respondSMP()");
    }
    otrl_.message_respond_smp(userstate._pointer,this._pointer,this._opsdata,context._pointer,secret,secret.length);
};
OtrlMessageAppOps.prototype.abortSMP = function(userstate,context){
    if(!(
        typeof userstate=='object' &&
        typeof context=='object'
    )){
        throw("invalid arguments to abort_smp()");
    }
    otrl_.message_abort_smp(userstate._pointer,this._pointer,this._opsdata,context._pointer);
};

OtrlMessageAppOps.prototype.extraSymKey = function(userstate,context,use,usedata){
    //return ArrayBuffer(32) (256bit extra symmetric key)

    var symkey_ptr = _malloc(32);//OTRL_EXTRAKEY_BYTES
    var symkey;

    if(typeof usedata == 'string'){
        usedata = helper_.str2ab(usedata);
    }
    var usedata_view = new Uint8Array(usedata);
    var usedata_ptr = _malloc(usedata_view.length);

    for(var i=0; i<usedata_view.length; i++){
        setValue(usedata_ptr+i,usedata_view[i],"i8");
    }

    var err = otrl_.message_symkey(userstate._pointer,this._pointer,this._opsdata,context._pointer,use, usedata_ptr, usedata_view.length, symkey_ptr);

    if(!err){
        symkey = helper_.ptr_to_ArrayBuffer(symkey_ptr,32);
        //symkey = helper_.ptr_to_HexString(symkey_ptr,32);
    }

    _free(symkey_ptr);
    _free(usedata_ptr);

    return symkey;
};

//TODO Add a SHA1 checksum of the file system.
//gzip and encrypt the file system?
// *** Closure Compiler will change names of objects inside the FS ***//
function VirtualFileSystem ( file ) {
 var defaultFile = file || "./virtual.vfs";
 return ({
    "export":function(){
        //note - devices are not properly exported because functions cannot be serialised.
        return JSON.stringify({
            "root": libModule.FS.root,
            "nextInode": libModule.FS.nextInode
        });
    },
    "import": function( data ){
        var importedFS = JSON.parse(data);
        //link devices to alreardy initialised file system. 
        //we should import a vfs early on and preferably once on initial launch of the application - (circular refrences below
        //could keep the FS data from being garbage collected?
        importedFS.root.contents['dev'].contents['random'].input = libModule.FS.root.contents['dev'].contents['random'].input;
        importedFS.root.contents['dev'].contents['random'].output = libModule.FS.root.contents['dev'].contents['random'].output;
        importedFS.root.contents['dev'].contents['urandom'].input = libModule.FS.root.contents['dev'].contents['urandom'].input;
        importedFS.root.contents['dev'].contents['urandom'].output = libModule.FS.root.contents['dev'].contents['urandom'].output;
        importedFS.root.contents['dev'].contents['stdout'].output = libModule.FS.root.contents['dev'].contents['stdout'].output;
        importedFS.root.contents['dev'].contents['stdin'].intput =  libModule.FS.root.contents['dev'].contents['stdin'].input;
        importedFS.root.contents['dev'].contents['stderr'].output = libModule.FS.root.contents['dev'].contents['stderr'].output;
        importedFS.root.contents['dev'].contents['tty'].output = libModule.FS.root.contents['dev'].contents['tty'].output;
        importedFS.root.contents['dev'].contents['tty'].input = libModule.FS.root.contents['dev'].contents['tty'].input;

        //var open_streams = libModule.FS.streams.length;
        //if(open_streams > 3) console.log("= VFS Import Warning:",open_streams - 3," files open.");//how to handle this case?
        
        //link default streams to imported devices -- this might not really be necessary..
        //stdin stream
          libModule.FS.streams[1].object = importedFS.root.contents['dev'].contents['stdin'];
        //stdou stream
          libModule.FS.streams[2].object = importedFS.root.contents['dev'].contents['stdout'];
        //stderr stream
          libModule.FS.streams[3].object = importedFS.root.contents['dev'].contents['stderr'];

        libModule.FS.root = importedFS.root;
        libModule.FS.nextInode = importedFS.nextInode;

    },
    "load": function( filename ){
        if(!fs) return;
        var realFile = filename || defaultFile;
        try{
            console.error("loading virtual file system:",realFile);
            var data = fs.readFileSync(realFile);
            this.import(data);
        }catch(e){
            console.error( e );
        }
        return this;
    },
    "save": function (filename){
        if(!fs) return;
        var realFile = filename || defaultFile;
        console.error("saving virtual filesystem to:",realFile);
        fs.writeFileSync(realFile,this.export());
        return this;
    },
    "importFile": function (source,destination,decrypt){
        //cp a file from real file system to virtual file system - full paths must be specified.
        if(!fs) return;
        destination = destination || source.substr(0);
        destination = path_vfs(destination);
        source = path_real(source);
        var target_folder, data, virtual_file;
        var filename = destination.split('/').reverse()[0];
        if( filename ){
            target_folder = libModule.FS.findObject(path_vfs(path.dirname(destination)));
            if(!target_folder){
                target_folder = libModule.FS.createPath("/",path_vfs(path.dirname(destination)),true,true);
            }
            if(target_folder){
              if( fs.existsSync(source) ){
                data = fs.readFileSync(source);
                data = decrypt ? decrypt(data) : data;
                virtual_file = libModule.FS.createDataFile(target_folder,filename,data,true,true);
              }else console.error("importing to vfs, file not found.",source);
            }
        }
    },
    "exportFile": function (source,destination,encrypt){
        //cp a file from virtual file system to real file system
        if(!fs) return;
        var data,fd;
        destination = destination || source.substr(0);//export to same path
        destination = path_real(destination);
        source = path_vfs(source);
        //TODO preserve same file permissions (mode) - make sure files only readable by user
        var object = libModule.FS.findObject(source);
        if(object){
            data = new Buffer(object.contents);
            data = encrypt ? encrypt(data) : data;
            if(!fs.existsSync(path_real(path.dirname(destination)))) fs.mkdirSync(path_real(path.dirname(destination)));
            fd = fs.openSync(destination,"w");
            fs.writeSync(fd,data,0,data.length,0);
            fs.closeSync(fd);        
        }else console.error("virtual file not found",source);
    }
 });
}

function path_real(p){
  return p.replace(new RegExp('/', 'g'), path.sep);
}
function path_vfs(p){
  return p.replace(new RegExp(/\\/g), '/');
}

function GcryptError( num ) {
    this.num = num || 0;
    this.message = gcry_.strerror(num || 0);
}
GcryptError.prototype = new Error();
GcryptError.prototype.constructor = GcryptError;


}).call(this);


});

require.define("fs",function(require,module,exports,__dirname,__filename,process,global){// nothing to see here... no file methods for the browser

});

require.define("otr",function(require,module,exports,__dirname,__filename,process,global){(function () {

  var root = this;
/*
 *  Off-the-Record Messaging bindings for node/javascript
 *  Copyright (C) 2012  Mokhtar Naamani,
 *                      <mokhtar.naamani@gmail.com>
 *
 *  This program is free software; you can redistribute it and/or modify
 *  it under the terms of version 2 of the GNU General Public License as
 *  published by the Free Software Foundation.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with this program; if not, write to the Free Software
 *  Foundation, Inc., 59 Temple Place, Suite 330, Boston, MA  02111-1307  USA
 */

var debug = function(){};

var otr, otrBindings, util, events;

if (typeof exports !== 'undefined') {
    otrBindings = require("./libotr-js-bindings.js");
    util = require('util');
    events = require('events');

    otr = new otrBindings();

    if(otr.version()!="4.0.0-emscripten"){
        console.error("Error. excpecting libotr4.0.0-emscripten! exiting..");
        process.exit();
    }

    module.exports = {
        debugOn: function(){
            debug = function(){console.log([].join.call(arguments," "));};
        },
        debugOff: function(){
            debug = function(){};
        },
        version: otr.version,
        User: User,
        ConnContext: otr.ConnContext,
        Session : OTRChannel,
        POLICY : OTRL_POLICY,
        MSGEVENT : OTRL_MSGEVENT,
        VFS: otr.VFS,
        //below wil not be exposed in future version..
        UserState: otr.UserState,    
        //discourage use of MessageAppOps
        //MessageAppOps : otr.MessageAppOps,    
        OTRChannel: OTRChannel
    };


}else{
    otrBindings = root.otrBindings;
    events = undefined;
    otr = new otrBindings();

    if(otr.version()!="4.0.0-emscripten"){
        alert("Warning. Excpecting libotr4.0.0-emscripten! OTR library not loaded.");
    }else{
        root.OTR = {
            debugOn: function(){
                debug = function(){console.log([].join.call(arguments," "));};
            },
            debugOff: function(){
                debug = function(){};
            },
            version: otr.version,
            User: User,
            ConnContext: otr.ConnContext,
            Session : OTRChannel,
            POLICY: OTRL_POLICY,
            MSGEVENT: OTRL_MSGEVENT,
            VFS: otr.VFS,
            //below wil not be exposed in future version..
            UserState: otr.UserState,    
            //discourage use of MessageAppOps
            //MessageAppOps : otr.MessageAppOps,    
            OTRChannel: OTRChannel
        };
   }
}

if(util && events) util.inherits(OTRChannel, events.EventEmitter);

function User( config ){
  if(config && config.keys && config.fingerprints && config.instags){
    this.state = new otr.UserState();
    this.keys = config.keys;
    this.instags = config.instags;
    this.fingerprints = config.fingerprints;
    try{    
        this.state.readKeysSync(this.keys);
    }catch(e){ console.error("Warning Reading Keys:",e);}
    try{
        this.state.readFingerprintsSync(this.fingerprints);
    }catch(e){ console.error("Warning Reading Fingerprints:",e);}
    try{
        this.state.readInstagsSync(this.instags);
    }catch(e){ console.error("Warning Reading Instant Tags:",e);}
  }else{
    return null;
  }
}

User.prototype.generateKey = function(accountname,protocol,callback){
    var user = this;
    this.state.generateKey(this.keys,accountname,protocol,function(){
        callback.apply(user,arguments);
    });
};

User.prototype.accounts = function (){
    return this.state.accounts();
};
User.prototype.fingerprint = function(accountname,protocol){
    return this.state.fingerprint(accountname,protocol);
};
User.prototype.generateInstag = function(accountname,protocol,callback){
    try{
        this.state.generateInstag(this.instags,accountname,protocol);
        if(callback) callback(null, this.state.findInstag(accountname,protocol));
    }catch(e){
        if(callback) callback(e,null);
    }
};
User.prototype.findInstag = function(accountname,protocol){
    return this.state.findInstag(accountname,protocol);
};
User.prototype.ConnContext = function(accountname, protocol, recipient){    
    return new otr.ConnContext(this.state,accountname,protocol,recipient);
};

User.prototype.writeFingerprints = function(){
    this.state.writeFingerprintsSync(this.fingerprints);
};
User.prototype.writeTrustedFingerprints = function(){
    this.state.writeTrustedFingerprintsSync(this.fingerprints);
};
User.prototype.findKey = function(accountname,protocol){
    return this.state.findKey(accountname,protocol);
};
User.prototype.deleteKey = function(accountname,protocol){
    this.state.deleteKeyOnFile(this.keys,accountname,protocol);
};
User.prototype.ConnContext = function(accountname, protocol, recipient){    
    return new otr.ConnContext(this.state,accountname,protocol,recipient);
};
User.prototype.writeKeys = function(){
    this.state.writeKeysSync(this.keys);
};

User.prototype.exportKeyBigInt = function(accountname,protocol){
    var k = this.findKey(accountname,protocol);
    if(k){
        return k.export("BIGINT");
    }
};
User.prototype.exportKeyHex = function(accountname,protocol){
    var k = this.findKey(accountname,protocol);
    if(k){
        return k.export("HEX");
    }
};

User.prototype.importKey = function(accountname,protocol,dsa,base){
    this.state.importKey(accountname,protocol,dsa,base);
    this.state.writeKeysSync(this.keys);
};

function OTRChannel(user, context, parameters){
    if(events) {
        events.EventEmitter.call(this);
    }else{
        this._events = {};
    }
    
    this.user = user;
    this.context = context;
    this.parameters = parameters;
    this.ops = new otr.MessageAppOps( OtrEventHandler(this) );
    
}

if(!events){
  //simple events API for use in the browser
  OTRChannel.prototype.on = function(e,cb){
    //used to register callbacks
    //store event name e in this._events 
    this._events[e] ? this._events[e].push(cb) : this._events[e]=[cb];

  };
  OTRChannel.prototype.emit = function(e){
    //used internally to fire events
    //'apply' event handler function  to 'this' channel pass eventname 'e' and arguemnts.slice(1)
    var self = this;
    var args = Array.prototype.slice.call(arguments);

    if(this._events && this._events[e]){
        this._events[e].forEach(function(cb){
            cb.apply(self,args.length>1?args.slice(1):[undefined]);
        });
    }
  };
}

OTRChannel.prototype.connect = function(){
    return this.send("?OTR?");
};
OTRChannel.prototype.send = function(message,instag){
    instag = instag || 1;//default instag = BEST 
    //message can be any object that can be serialsed to a string using it's .toString() method.   
    var msgout = this.ops.messageSending(this.user.state, this.context.accountname(), this.context.protocol(), this.context.username(), message.toString(), instag, this);
    if(msgout){
        //frag policy something other than SEND_ALL.. results in a fragment to be sent manually
        this.emit("inject_message",msgout);
    }
};
OTRChannel.prototype.recv = function(message){
    //message can be any object that can be serialsed to a string using it's .toString() method.
    var msg = this.ops.messageReceiving(this.user.state, this.context.accountname(), this.context.protocol(), this.context.username(), message.toString(), this);
    if(msg) this.emit("message",msg,this.isEncrypted());
};
OTRChannel.prototype.close = function(){
    this.ops.disconnect(this.user.state,this.context.accountname(),this.context.protocol(),this.context.username(),this.context.their_instance());
    this.emit("shutdown");
};
OTRChannel.prototype.start_smp = function(secret){
    var sec = secret;
    sec = sec || (this.parameters? this.parameters.secret:undefined);
    if(sec){
        this.ops.initSMP(this.user.state, this.context, sec);
    }else{
        throw( new Error("No Secret Provided"));
    }
};

OTRChannel.prototype.start_smp_question = function(question,secret){
    if(!question){
        throw(new Error("No Question Provided"));        
    }
    var sec = secret;
    if(!sec){
        sec = this.parameters ? this.parameters.secrets : undefined;
        if(!sec) throw(new Error("No Secrets Provided"));
        sec = sec[question];        
    }    
    
    if(!sec) throw(new Error("No Secret Matched for Question"));
   
    this.ops.initSMP(this.user.state, this.context, sec,question);
};

OTRChannel.prototype.respond_smp = function(secret){
    var sec = secret ? secret : undefined;
    if(!sec){
        sec = this.parameters ? this.parameters.secret : undefined;
    }
    if(!sec) throw( new Error("No Secret Provided"));    
    this.ops.respondSMP(this.user.state, this.context, sec);
};
OTRChannel.prototype.abort_smp = function(){
   this.ops.abortSMP(this.user.state,this.context);
};

OTRChannel.prototype.isEncrypted = function(){
    return (this.context.msgstate()===1);
};
OTRChannel.prototype.isAuthenticated = function(){
    return (this.context.trust()==="smp");
};
OTRChannel.prototype.extraSymKey = function(use,usedata){
    return this.ops.extraSymKey(this.user.state,this.context,use,usedata);
};

function OtrEventHandler( otrChannel ){
 function emit(){
    otrChannel.emit.apply(otrChannel,arguments);
 }
 return (function(o){
    debug(otrChannel.user.name+":"+o.EVENT);
    switch(o.EVENT){
        case "smp_error":
            otrChannel.abort_smp();
            emit("smp_failed");
            return;
        case "smp_request":
            if(o.question) debug("SMP Question:"+o.question);
            emit(o.EVENT,o.question);
            return;
        case "smp_complete":
            emit(o.EVENT);
            return;
        case "smp_failed":
            emit(o.EVENT);
            return;
        case "smp_aborted":
            emit(o.EVENT);
            return;
        case "is_logged_in":
            //TODO:function callback. for now remote party is always assumed to be online
            return 1;
        case "gone_secure":
            emit(o.EVENT);
            return;
        case "gone_insecure":
            //never get's called by libotr4.0.0?
            emit(o.EVENT);
            return;
        case "policy":
            if(!otrChannel.parameters) return OTRL_POLICY("DEFAULT");
            if(typeof otrChannel.parameters.policy == 'number' ) return otrChannel.parameters.policy;//todo: validate policy
            return OTRL_POLICY("DEFAULT");
        case "update_context_list":
            emit(o.EVENT);
            return;
        case "max_message_size":
            if(!otrChannel.parameters) return 0;
            return otrChannel.parameters.MTU || 0;
        case "inject_message":
            emit(o.EVENT,o.message);
            return;
        case "create_privkey":
            emit(o.EVENT,o.accountname,o.protocol);
            return;
        case "new_fingerprint":
            debug("NEW FINGERPRINT: "+o.fingerprint);
            emit(o.EVENT,o.fingerprint);
            return;
        case "write_fingerprints":
            //otrChannel.user.writeFingerprints();//application must decide if it will save new fingerprints..
            emit(o.EVENT);
            return;
        case "still_secure":
            emit(o.EVENT);
            return;
        case "msg_event":
            debug(o.EVENT+"[ "+OTRL_MSGEVENT(o.event)+" ] - "+o.message);
            if(OTRL_MSGEVENT(o.event) == "RCVDMSG_UNENCRYPTED"){
                emit("message",o.message,false);
            }
            emit(o.EVENT,o.event,o.message,o.err);
            return;
        case "create_instag":
            emit(o.EVENT,o.accountname,o.protocol);
            return;
        case "received_symkey":
            emit(o.EVENT,o.use,o.usedata,o.key);
            return;
        case "remote_disconnected":
            return emit(o.EVENT);            
        default:
            console.error("== UNHANDLED EVENT == :",o.EVENT);
            return;
    }
 });
}

/* --- libotr-4.0.0/src/proto.h   */
var _policy = {
    'NEVER':0x00,
    'ALLOW_V1': 0x01,
    'ALLOW_V2': 0x02,
    'ALLOW_V3': 0x04,
    'REQUIRE_ENCRYPTION': 0x08,
    'SEND_WHITESPACE_TAG': 0x10,
    'WHITESPACE_START_AKE': 0x20,
    'ERROR_START_AKE': 0x40
};

_policy['VERSION_MASK'] = _policy['ALLOW_V1']|_policy['ALLOW_V2']|_policy['ALLOW_V3'];
_policy['OPPORTUNISTIC'] =  _policy['ALLOW_V1']|_policy['ALLOW_V2']|_policy['ALLOW_V3']|_policy['SEND_WHITESPACE_TAG']|_policy['WHITESPACE_START_AKE']|_policy['ERROR_START_AKE'];
_policy['MANUAL'] = _policy['ALLOW_V1']|_policy['ALLOW_V2']|_policy['ALLOW_V3'];
_policy['ALWAYS'] = _policy['ALLOW_V1']|_policy['ALLOW_V2']|_policy['ALLOW_V3']|_policy['REQUIRE_ENCRYPTION']|_policy['WHITESPACE_START_AKE']|_policy['ERROR_START_AKE'];
_policy['DEFAULT'] = _policy['OPPORTUNISTIC']

function OTRL_POLICY(p){  
    return _policy[p];
};

var _otrl_msgevent=[
    "NONE",
    "ENCRYPTION_REQUIRED",
    "ENCRYPTION_ERROR",
    "CONNECTION_ENDED",
    "SETUP_ERROR",
    "MSG_REFLECTED",
    "MSG_RESENT",
    "RCVDMSG_NOT_IN_PRIVATE",
    "RCVDMSG_UNREADABLE",
    "RCVDMSG_MALFORMED",
    "LOG_HEARTBEAT_RCVD",
    "LOG_HEARTBEAT_SENT",
    "RCVDMSG_GENERAL_ERR",
    "RCVDMSG_UNENCRYPTED",
    "RCVDMSG_UNRECOGNIZED",
    "RCVDMSG_FOR_OTHER_INSTANCE"
];
function OTRL_MSGEVENT(e){
    return _otrl_msgevent[e];
}


}).call(this);


});

require.define("util",function(require,module,exports,__dirname,__filename,process,global){var events = require('events');

exports.isArray = isArray;
exports.isDate = function(obj){return Object.prototype.toString.call(obj) === '[object Date]'};
exports.isRegExp = function(obj){return Object.prototype.toString.call(obj) === '[object RegExp]'};


exports.print = function () {};
exports.puts = function () {};
exports.debug = function() {};

exports.inspect = function(obj, showHidden, depth, colors) {
  var seen = [];

  var stylize = function(str, styleType) {
    // http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
    var styles =
        { 'bold' : [1, 22],
          'italic' : [3, 23],
          'underline' : [4, 24],
          'inverse' : [7, 27],
          'white' : [37, 39],
          'grey' : [90, 39],
          'black' : [30, 39],
          'blue' : [34, 39],
          'cyan' : [36, 39],
          'green' : [32, 39],
          'magenta' : [35, 39],
          'red' : [31, 39],
          'yellow' : [33, 39] };

    var style =
        { 'special': 'cyan',
          'number': 'blue',
          'boolean': 'yellow',
          'undefined': 'grey',
          'null': 'bold',
          'string': 'green',
          'date': 'magenta',
          // "name": intentionally not styling
          'regexp': 'red' }[styleType];

    if (style) {
      return '\033[' + styles[style][0] + 'm' + str +
             '\033[' + styles[style][1] + 'm';
    } else {
      return str;
    }
  };
  if (! colors) {
    stylize = function(str, styleType) { return str; };
  }

  function format(value, recurseTimes) {
    // Provide a hook for user-specified inspect functions.
    // Check that value is an object with an inspect function on it
    if (value && typeof value.inspect === 'function' &&
        // Filter out the util module, it's inspect function is special
        value !== exports &&
        // Also filter out any prototype objects using the circular check.
        !(value.constructor && value.constructor.prototype === value)) {
      return value.inspect(recurseTimes);
    }

    // Primitive types cannot have properties
    switch (typeof value) {
      case 'undefined':
        return stylize('undefined', 'undefined');

      case 'string':
        var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                                 .replace(/'/g, "\\'")
                                                 .replace(/\\"/g, '"') + '\'';
        return stylize(simple, 'string');

      case 'number':
        return stylize('' + value, 'number');

      case 'boolean':
        return stylize('' + value, 'boolean');
    }
    // For some reason typeof null is "object", so special case here.
    if (value === null) {
      return stylize('null', 'null');
    }

    // Look up the keys of the object.
    var visible_keys = Object_keys(value);
    var keys = showHidden ? Object_getOwnPropertyNames(value) : visible_keys;

    // Functions without properties can be shortcutted.
    if (typeof value === 'function' && keys.length === 0) {
      if (isRegExp(value)) {
        return stylize('' + value, 'regexp');
      } else {
        var name = value.name ? ': ' + value.name : '';
        return stylize('[Function' + name + ']', 'special');
      }
    }

    // Dates without properties can be shortcutted
    if (isDate(value) && keys.length === 0) {
      return stylize(value.toUTCString(), 'date');
    }

    var base, type, braces;
    // Determine the object type
    if (isArray(value)) {
      type = 'Array';
      braces = ['[', ']'];
    } else {
      type = 'Object';
      braces = ['{', '}'];
    }

    // Make functions say that they are functions
    if (typeof value === 'function') {
      var n = value.name ? ': ' + value.name : '';
      base = (isRegExp(value)) ? ' ' + value : ' [Function' + n + ']';
    } else {
      base = '';
    }

    // Make dates with properties first say the date
    if (isDate(value)) {
      base = ' ' + value.toUTCString();
    }

    if (keys.length === 0) {
      return braces[0] + base + braces[1];
    }

    if (recurseTimes < 0) {
      if (isRegExp(value)) {
        return stylize('' + value, 'regexp');
      } else {
        return stylize('[Object]', 'special');
      }
    }

    seen.push(value);

    var output = keys.map(function(key) {
      var name, str;
      if (value.__lookupGetter__) {
        if (value.__lookupGetter__(key)) {
          if (value.__lookupSetter__(key)) {
            str = stylize('[Getter/Setter]', 'special');
          } else {
            str = stylize('[Getter]', 'special');
          }
        } else {
          if (value.__lookupSetter__(key)) {
            str = stylize('[Setter]', 'special');
          }
        }
      }
      if (visible_keys.indexOf(key) < 0) {
        name = '[' + key + ']';
      }
      if (!str) {
        if (seen.indexOf(value[key]) < 0) {
          if (recurseTimes === null) {
            str = format(value[key]);
          } else {
            str = format(value[key], recurseTimes - 1);
          }
          if (str.indexOf('\n') > -1) {
            if (isArray(value)) {
              str = str.split('\n').map(function(line) {
                return '  ' + line;
              }).join('\n').substr(2);
            } else {
              str = '\n' + str.split('\n').map(function(line) {
                return '   ' + line;
              }).join('\n');
            }
          }
        } else {
          str = stylize('[Circular]', 'special');
        }
      }
      if (typeof name === 'undefined') {
        if (type === 'Array' && key.match(/^\d+$/)) {
          return str;
        }
        name = JSON.stringify('' + key);
        if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
          name = name.substr(1, name.length - 2);
          name = stylize(name, 'name');
        } else {
          name = name.replace(/'/g, "\\'")
                     .replace(/\\"/g, '"')
                     .replace(/(^"|"$)/g, "'");
          name = stylize(name, 'string');
        }
      }

      return name + ': ' + str;
    });

    seen.pop();

    var numLinesEst = 0;
    var length = output.reduce(function(prev, cur) {
      numLinesEst++;
      if (cur.indexOf('\n') >= 0) numLinesEst++;
      return prev + cur.length + 1;
    }, 0);

    if (length > 50) {
      output = braces[0] +
               (base === '' ? '' : base + '\n ') +
               ' ' +
               output.join(',\n  ') +
               ' ' +
               braces[1];

    } else {
      output = braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
    }

    return output;
  }
  return format(obj, (typeof depth === 'undefined' ? 2 : depth));
};


function isArray(ar) {
  return ar instanceof Array ||
         Array.isArray(ar) ||
         (ar && ar !== Object.prototype && isArray(ar.__proto__));
}


function isRegExp(re) {
  return re instanceof RegExp ||
    (typeof re === 'object' && Object.prototype.toString.call(re) === '[object RegExp]');
}


function isDate(d) {
  if (d instanceof Date) return true;
  if (typeof d !== 'object') return false;
  var properties = Date.prototype && Object_getOwnPropertyNames(Date.prototype);
  var proto = d.__proto__ && Object_getOwnPropertyNames(d.__proto__);
  return JSON.stringify(proto) === JSON.stringify(properties);
}

function pad(n) {
  return n < 10 ? '0' + n.toString(10) : n.toString(10);
}

var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
              'Oct', 'Nov', 'Dec'];

// 26 Feb 16:19:34
function timestamp() {
  var d = new Date();
  var time = [pad(d.getHours()),
              pad(d.getMinutes()),
              pad(d.getSeconds())].join(':');
  return [d.getDate(), months[d.getMonth()], time].join(' ');
}

exports.log = function (msg) {};

exports.pump = null;

var Object_keys = Object.keys || function (obj) {
    var res = [];
    for (var key in obj) res.push(key);
    return res;
};

var Object_getOwnPropertyNames = Object.getOwnPropertyNames || function (obj) {
    var res = [];
    for (var key in obj) {
        if (Object.hasOwnProperty.call(obj, key)) res.push(key);
    }
    return res;
};

var Object_create = Object.create || function (prototype, properties) {
    // from es5-shim
    var object;
    if (prototype === null) {
        object = { '__proto__' : null };
    }
    else {
        if (typeof prototype !== 'object') {
            throw new TypeError(
                'typeof prototype[' + (typeof prototype) + '] != \'object\''
            );
        }
        var Type = function () {};
        Type.prototype = prototype;
        object = new Type();
        object.__proto__ = prototype;
    }
    if (typeof properties !== 'undefined' && Object.defineProperties) {
        Object.defineProperties(object, properties);
    }
    return object;
};

exports.inherits = function(ctor, superCtor) {
  ctor.super_ = superCtor;
  ctor.prototype = Object_create(superCtor.prototype, {
    constructor: {
      value: ctor,
      enumerable: false,
      writable: true,
      configurable: true
    }
  });
};

var formatRegExp = /%[sdj%]/g;
exports.format = function(f) {
  if (typeof f !== 'string') {
    var objects = [];
    for (var i = 0; i < arguments.length; i++) {
      objects.push(exports.inspect(arguments[i]));
    }
    return objects.join(' ');
  }

  var i = 1;
  var args = arguments;
  var len = args.length;
  var str = String(f).replace(formatRegExp, function(x) {
    if (x === '%%') return '%';
    if (i >= len) return x;
    switch (x) {
      case '%s': return String(args[i++]);
      case '%d': return Number(args[i++]);
      case '%j': return JSON.stringify(args[i++]);
      default:
        return x;
    }
  });
  for(var x = args[i]; i < len; x = args[++i]){
    if (x === null || typeof x !== 'object') {
      str += ' ' + x;
    } else {
      str += ' ' + exports.inspect(x);
    }
  }
  return str;
};

});

require.define("events",function(require,module,exports,__dirname,__filename,process,global){if (!process.EventEmitter) process.EventEmitter = function () {};

var EventEmitter = exports.EventEmitter = process.EventEmitter;
var isArray = typeof Array.isArray === 'function'
    ? Array.isArray
    : function (xs) {
        return Object.prototype.toString.call(xs) === '[object Array]'
    }
;
function indexOf (xs, x) {
    if (xs.indexOf) return xs.indexOf(x);
    for (var i = 0; i < xs.length; i++) {
        if (x === xs[i]) return i;
    }
    return -1;
}

// By default EventEmitters will print a warning if more than
// 10 listeners are added to it. This is a useful default which
// helps finding memory leaks.
//
// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
var defaultMaxListeners = 10;
EventEmitter.prototype.setMaxListeners = function(n) {
  if (!this._events) this._events = {};
  this._events.maxListeners = n;
};


EventEmitter.prototype.emit = function(type) {
  // If there is no 'error' event listener then throw.
  if (type === 'error') {
    if (!this._events || !this._events.error ||
        (isArray(this._events.error) && !this._events.error.length))
    {
      if (arguments[1] instanceof Error) {
        throw arguments[1]; // Unhandled 'error' event
      } else {
        throw new Error("Uncaught, unspecified 'error' event.");
      }
      return false;
    }
  }

  if (!this._events) return false;
  var handler = this._events[type];
  if (!handler) return false;

  if (typeof handler == 'function') {
    switch (arguments.length) {
      // fast cases
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      // slower
      default:
        var args = Array.prototype.slice.call(arguments, 1);
        handler.apply(this, args);
    }
    return true;

  } else if (isArray(handler)) {
    var args = Array.prototype.slice.call(arguments, 1);

    var listeners = handler.slice();
    for (var i = 0, l = listeners.length; i < l; i++) {
      listeners[i].apply(this, args);
    }
    return true;

  } else {
    return false;
  }
};

// EventEmitter is defined in src/node_events.cc
// EventEmitter.prototype.emit() is also defined there.
EventEmitter.prototype.addListener = function(type, listener) {
  if ('function' !== typeof listener) {
    throw new Error('addListener only takes instances of Function');
  }

  if (!this._events) this._events = {};

  // To avoid recursion in the case that type == "newListeners"! Before
  // adding it to the listeners, first emit "newListeners".
  this.emit('newListener', type, listener);

  if (!this._events[type]) {
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  } else if (isArray(this._events[type])) {

    // Check for listener leak
    if (!this._events[type].warned) {
      var m;
      if (this._events.maxListeners !== undefined) {
        m = this._events.maxListeners;
      } else {
        m = defaultMaxListeners;
      }

      if (m && m > 0 && this._events[type].length > m) {
        this._events[type].warned = true;
        console.error('(node) warning: possible EventEmitter memory ' +
                      'leak detected. %d listeners added. ' +
                      'Use emitter.setMaxListeners() to increase limit.',
                      this._events[type].length);
        console.trace();
      }
    }

    // If we've already got an array, just append.
    this._events[type].push(listener);
  } else {
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  var self = this;
  self.on(type, function g() {
    self.removeListener(type, g);
    listener.apply(this, arguments);
  });

  return this;
};

EventEmitter.prototype.removeListener = function(type, listener) {
  if ('function' !== typeof listener) {
    throw new Error('removeListener only takes instances of Function');
  }

  // does not use listeners(), so no side effect of creating _events[type]
  if (!this._events || !this._events[type]) return this;

  var list = this._events[type];

  if (isArray(list)) {
    var i = indexOf(list, listener);
    if (i < 0) return this;
    list.splice(i, 1);
    if (list.length == 0)
      delete this._events[type];
  } else if (this._events[type] === listener) {
    delete this._events[type];
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  // does not use listeners(), so no side effect of creating _events[type]
  if (type && this._events && this._events[type]) this._events[type] = null;
  return this;
};

EventEmitter.prototype.listeners = function(type) {
  if (!this._events) this._events = {};
  if (!this._events[type]) this._events[type] = [];
  if (!isArray(this._events[type])) {
    this._events[type] = [this._events[type]];
  }
  return this._events[type];
};

});

require.define("os",function(require,module,exports,__dirname,__filename,process,global){var udp = ti_require("ti.udp");
var sock = udp.createSocket();

exports.networkInterfaces=function(){
    var address = sock.getLocalIPv4Address();
    
    if(address==""){
    	return undefined;
    }
    
    if(address=="127.0.0.1"){
    	return ({
		  'lo':[{'address':'127.0.0.1', 'family':'IPv4'}]          
    	});    	
    }
    
   	return ({
	  'lo':[{'address':'127.0.0.1', 'family':'IPv4'}],
	  'eth0':[{'address':address, 'family':'IPv4'}]
   	});    	
}

});

require.define("iputil",function(require,module,exports,__dirname,__filename,process,global){var os = require('os');

exports.getLocalIP = get_local_ip_addresses;
exports.isLocalIP = is_local_ip;
exports.isSameIP = is_same_ipp;
exports.isPrivateIP = is_private_ip;
exports.isPublicIP = is_public_ip;
exports.IP = IP;
exports.PORT = PORT;
//exports.refreshIP = refresh_ifaces;

var ipAddr;

//return list of local IP addresses
function get_local_ip_addresses() {
    if (ipAddr) return ipAddr; //only do detecion once..
    ipAddr = [];

    //console.error("Detecting Local IP Addresses..");
    var ifaces = os.networkInterfaces(); //this doesn't work on windows node implementation yet :( - April 5 2012
    for (var dev in ifaces) {
        var alias = 0;
        ifaces[dev].forEach(function (details) {
            if (details.family == 'IPv4') {
                ipAddr.push(details.address);
                //console.error(dev + (alias ? ':' + alias : ''), details.address);
                ++alias;
            }
        });
    }

    return ipAddr;
}

function refresh_ifaces() {
    ipAddr = undefined;
    return get_local_ip_addresses();
}

function is_local_ip(ip) {
    var local = get_local_ip_addresses();
    var isLocal = false;
    local.forEach(function (local_ip) {
        if (local_ip == IP(ip)) isLocal = true;
    });
    return isLocal;
}

function IP(ipp) {
    var ip;
    (ipp.indexOf(':') > 0) ? ip = ipp.substr(0, ipp.indexOf(':')) : ip = ipp;
    return ip;
}

function PORT(ipp) {
    return parseInt(ipp.substr(ipp.indexOf(':') + 1));
}

function is_same_ipp(a, b) {
    return (IP(a) == IP(b));
}

function is_public_ip(ipp) {
    return !is_private_ip(ipp);
}

function is_private_ip(ipp) {
    var ip = IP(ipp);
    if (ip.indexOf('127.0.0.1') == 0) return true;
    if (ip.indexOf('10.') == 0) return true;
    if (ip.indexOf('192.168.') == 0) return true;
    if (ip.indexOf('172.16.') == 0) return true;
    if (ip.indexOf('172.17.') == 0) return true;
    if (ip.indexOf('172.18.') == 0) return true;
    if (ip.indexOf('172.19.') == 0) return true;
    if (ip.indexOf('172.20.') == 0) return true;
    if (ip.indexOf('172.21.') == 0) return true;
    if (ip.indexOf('172.22.') == 0) return true;
    if (ip.indexOf('172.23.') == 0) return true;
    if (ip.indexOf('172.24.') == 0) return true;
    if (ip.indexOf('172.25.') == 0) return true;
    if (ip.indexOf('172.26.') == 0) return true;
    if (ip.indexOf('172.27.') == 0) return true;
    if (ip.indexOf('172.28.') == 0) return true;
    if (ip.indexOf('172.29.') == 0) return true;
    if (ip.indexOf('172.30.') == 0) return true;
    if (ip.indexOf('172.31.') == 0) return true;
    if (ip.indexOf('0.') == 0) return true;
    if (ip.indexOf('255.') == 0) return true;

    return false;
}

});

require.define("dgram",function(require,module,exports,__dirname,__filename,process,global){var iputil = require('iputil');
//var Buffer = require("buffer").Buffer;
var events = require("events");
var util = require("util");

var UDP = ti_require('ti.udp');

util.inherits(DGram, events.EventEmitter);

exports.createSocket =function(type, incoming){
	return new DGram(incoming);
};

function DGram(incoming){
	var self = this;
    events.EventEmitter.call(this);

	this.socket = UDP.createSocket();
	this.socket.addEventListener('data', function(evt){
		//console.log(JSON.stringify(evt));
		//console.log("INCOMING PACKET:"+new Buffer(evt.bytesData).toString());
		//console.log("INCOMING PACKET LENGTH:"+evt.bytesData.length);
		incoming(
            new Buffer(evt.bytesData),
			{address:iputil.IP(evt.address.substr(1)), port:iputil.PORT(evt.address.substr(1))}
			//{address:iputil.IP(evt.address), port:iputil.PORT(evt.address)}
		);
	});
	this.socket.addEventListener('error', function (evt) {
    	console.log(JSON.stringify(evt));
        self.emit("error");
	});
	this.socket.addEventListener('started',function(evt){
		self._port = this.socketPort();
		self._address = this.getLocalIPv4Address();
        self.emit("listening");
	});
	return self;
};

DGram.prototype.bind = function(port, ip){
    this._port = port || 0;
	this.socket.start({
		port:this._port
	});
};

DGram.prototype.close = function(){
	this.socket.stop();
};

DGram.prototype.send = function (buff, offset, length, port, ip) {
//    console.log("about to send on dgram");
//    console.log(JSON.stringify(buff));
	this.socket.sendBytes({
		host:ip,
		port:port,
		data:buffer2Array(buff)
	});
};

DGram.prototype.address = function(){	
    return({
        port:this._port,
        address:this._address
    });
};

function buffer2Array(buff){
    var arr,i;
    if(buff.readUInt8){
        arr = new Array(buff.length);
        for(i=0;i<buff.length;i++){
            arr[i]=buff.readUInt8(i);
        }
    }else{
        arr = buff;
    }
    return arr;
}

});

require.define("enet",function(require,module,exports,__dirname,__filename,process,global){var Buffer = require("buffer").Buffer;
var udp_sockets_count=0;
var udp_sockets = {};
var global_udp_callback = function(msg,rinfo,sfd){
    //que each packet it will be de-queed when recvmsg() is called
    var udpsocket = udp_sockets[sfd];
    if(udpsocket){
        udpsocket.packets.enqueue({
            data:msg,
            dataLength:msg.length,
            ip:rinfo.address,
            port:rinfo.port
        });
    }
}
function long2ip(l, source) {
    if(l<0){
	 throw('long2ip got a negative number!');
    }
    with (Math) {   
        var ip1 = floor(l/pow(256,3));
        var ip2 = floor((l%pow(256,3))/pow(256,2));
        var ip3 = floor(((l%pow(256,3))%pow(256,2))/pow(256,1));
        var ip4 = floor((((l%pow(256,3))%pow(256,2))%pow(256,1))/pow(256,0));
    }
    return ip1 + '.' + ip2 + '.' + ip3 + '.' + ip4;
}
function ip2long(ip) {
    var ips = ip.split('.');
    var iplong = 0;
    with (Math) {
        iplong = ips[0]*pow(256,3)+ips[1]*pow(256,2)+ips[2]*pow(256,1)+ips[3]*pow(256,0);
    }
    if(iplong<0) throw ('ip2long produced a negative number! '+iplong);
    return iplong;
}
function BufferConcat( buffers ){
    var totalLength = 0;
    buffers.forEach(function(B){
        if(!B || !B.length) return;
        totalLength = totalLength + B.length;
    });
    if(!totalLength) return [];
    var buf = new Buffer(totalLength);
    var i = 0;
    buffers.forEach(function(B){
        for(var b=0; b<B.length;b++){
            buf.writeUInt8(B.readUInt8(b),i);
            i++;
        }
    });
    return buf;
}
function C_String_to_JS_String(ptr){
    var str = "";
    var i = 0;
    while (HEAP8[((ptr)+(i))]){         
         str = str + String.fromCharCode(HEAPU8[((ptr)+(i))]);
         i++; // Note: should be |!= 0|, technically.
    }
    return str;
}
function JS_String_to_CString(jstr, ptr){
    var i=0;
    for(;i<jstr.length;){
        HEAPU8[(((ptr+i)|0))]=jstr.charCodeAt(i);
        i++;
    }
    HEAPU8[(((ptr+i)|0))]=0;//terminating null
}
var Module = {};
Module["preRun"]=[];
Module['preRun'].push(function(){
    	_gethostbyname = _gehostbyname_r = function(){ return 0; }
        _fcntl=function(){return -1;}
        _ioctl=function(){return -1;}
        _ntohs = _htons;
        _ntohl = _htonl;
        //enet API functions from unix.c
        _enet_socket_create =function(){
            var sfd;
            try{
                udp_sockets_count++;
                sfd = udp_sockets_count;
                udp_sockets[sfd]=DGRAM.createSocket("udp4",function(msg,rinfo){
                    global_udp_callback(msg,rinfo,sfd);
                });
                udp_sockets[sfd].packets = new Queue();
            }catch(e){
                sfd=-1;
            }            
            return sfd;
        };
        _enet_socket_bind = function($socket,$address){
          var $host=0;
          var $port=0;
          if($address){
              $host = HEAPU32[(($address)>>2)];
              $port = HEAPU16[(($address+4)>>1)];
          }
          if(udp_sockets[$socket]){
              console.error("binding to",long2ip($host),$port);
              udp_sockets[$socket].bind($port,long2ip($host));
              return 0;
          }
          return -1;//todo: set error number
        };
        _enet_socket_listen = function($socket, $backlog){
        };        
        _enet_socket_set_option = function(){
            return 0;
        };
        function get_sockaddr_in($sin){
            return ({
                "family": HEAP32[($sin+0)>>1],
                "port":   HEAPU16[($sin+4)>>1],
                "addr":   HEAPU32[($sin+8)>>2]
            });
        }
        function set_sockaddr_in($sin,family,port,address){
              HEAP32[($sin+0)>>1] = family;
              HEAP16[($sin+4)>>1] = port;
              HEAPU32[($sin+8)>>2] = address;
        }
        _recvmsg = function($sockfd, $msgHdr, $flags) {
          var udpsocket = udp_sockets[$sockfd];
          if(!udpsocket) return -1;
          if(!udpsocket.packets.getLength()) return 0;
          //dequeue
          var packet = udpsocket.packets.dequeue();
          if(!packet) return 0;
          var $sin=HEAP32[(($msgHdr)>>2)];
          var $buffer=HEAP32[(($msgHdr+8)>>2)];
          HEAP32[(($buffer+4)>>2)]=packet.dataLength;//dataLength
          var $data=HEAP32[($buffer)>>2];
          //Copy Node Buffer packet.data into HEAP8[($data)|0],HEAP8[($data+1)|0]
          //MAX_MTU?
          for(var i=0;i<packet.dataLength;i++){
            HEAPU8[($data+i)|0]=packet.data.readUInt8(i);
          }
          set_sockaddr_in($sin,1,_htons(packet.port),ip2long(packet.ip));
          return packet.dataLength;//truncation??
        };
        _sendmsg = function($sockfd, $msgHdr, $flags) {
          var udpsocket = udp_sockets[$sockfd];
          if(!udpsocket) return -1;
          var chunks = [];
          var chunk;
          var chunkLength;
          var $sin=HEAP32[(($msgHdr)>>2)];
          var $buffers=HEAP32[(($msgHdr+8)>>2)];
          var $bufferCount=HEAPU32[($msgHdr+12)>>2];
          var packet = {};
          var addr = get_sockaddr_in($sin);
          for( var $x=0; $x < $bufferCount ; $x++ ){
              chunkLength = HEAP32[(($buffers+($x<<3)+4)>>2)];
              chunk = new Buffer(chunkLength);
              $data=HEAP32[($buffers+($x<<3))>>2]
              if(!chunkLength) continue;
              //Copy HEAP into node Buffer
              for(var i=0;i<chunkLength;i++){
                chunk.writeUInt8(HEAPU8[($data+i)|0],i);
              }
              chunks.push(chunk);
           }
              //HEAP16[(($sin)>>1)]  //AF_INET == 1
              packet.ip = long2ip(addr.addr);
              packet.port=_ntohs(addr.port);
              packet.data = BufferConcat(chunks);
              packet.dataLength = packet.data.length;
              udpsocket.send(packet.data,0,packet.data.length,packet.port,packet.ip,function(){
                 //console.log("Sent Packet:",packet);
              });
              return packet.data.length;
        };
        _enet_socket_wait = function(){
            //console.error("enet_socket_wait()",arguments);
            return -1;//don't wait
        };
        _enet_socket_destroy = function($socket){
            //console.log("enet_socket_destroy()",arguments);
            if(udp_sockets[$socket]){
                udp_sockets[$socket].close();
                delete udp_sockets[$socket];
            }
        };
});//preRun
// Note: For maximum-speed code, see "Optimizing Code" on the Emscripten wiki, https://github.com/kripken/emscripten/wiki/Optimizing-Code
// Note: Some Emscripten settings may limit the speed of the generated code.
try {
  this['Module'] = Module;
} catch(e) {
  this['Module'] = Module = {};
}
// The environment setup code below is customized to use Module.
// *** Environment setup code ***
var ENVIRONMENT_IS_NODE = typeof process === 'object' && typeof require === 'function';
var ENVIRONMENT_IS_WEB = typeof window === 'object';
var ENVIRONMENT_IS_WORKER = typeof importScripts === 'function';
var ENVIRONMENT_IS_SHELL = !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_NODE && !ENVIRONMENT_IS_WORKER;
if (ENVIRONMENT_IS_NODE) {
  // Expose functionality in the same simple way that the shells work
  // Note that we pollute the global namespace here, otherwise we break in node
  Module['print'] = function(x) {
    process['stdout'].write(x + '\n');
  };
  Module['printErr'] = function(x) {
    process['stderr'].write(x + '\n');
  };
  var nodeFS = require('fs');
  var nodePath = require('path');
  Module['read'] = function(filename) {
    filename = nodePath['normalize'](filename);
    var ret = nodeFS['readFileSync'](filename).toString();
    // The path is absolute if the normalized version is the same as the resolved.
    if (!ret && filename != nodePath['resolve'](filename)) {
      filename = path.join(__dirname, '..', 'src', filename);
      ret = nodeFS['readFileSync'](filename).toString();
    }
    return ret;
  };
  Module['load'] = function(f) {
    globalEval(read(f));
  };
  if (!Module['arguments']) {
    Module['arguments'] = process['argv'].slice(2);
  }
}
if (ENVIRONMENT_IS_SHELL) {
  Module['print'] = print;
  if (typeof printErr != 'undefined') Module['printErr'] = printErr; // not present in v8 or older sm
  // Polyfill over SpiderMonkey/V8 differences
  if (typeof read != 'undefined') {
    Module['read'] = read;
  } else {
    Module['read'] = function(f) { snarf(f) };
  }
  if (!Module['arguments']) {
    if (typeof scriptArgs != 'undefined') {
      Module['arguments'] = scriptArgs;
    } else if (typeof arguments != 'undefined') {
      Module['arguments'] = arguments;
    }
  }
}
if (ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_WORKER) {
  if (!Module['print']) {
    Module['print'] = function(x) {
      console.log(x);
    };
  }
  if (!Module['printErr']) {
    Module['printErr'] = function(x) {
      console.log(x);
    };
  }
}
if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
  Module['read'] = function(url) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, false);
    xhr.send(null);
    return xhr.responseText;
  };
  if (!Module['arguments']) {
    if (typeof arguments != 'undefined') {
      Module['arguments'] = arguments;
    }
  }
}
if (ENVIRONMENT_IS_WORKER) {
  // We can do very little here...
  var TRY_USE_DUMP = false;
  if (!Module['print']) {
    Module['print'] = (TRY_USE_DUMP && (typeof(dump) !== "undefined") ? (function(x) {
      dump(x);
    }) : (function(x) {
      // self.postMessage(x); // enable this if you want stdout to be sent as messages
    }));
  }
  Module['load'] = importScripts;
}
if (!ENVIRONMENT_IS_WORKER && !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_NODE && !ENVIRONMENT_IS_SHELL) {
  // Unreachable because SHELL is dependant on the others
  throw 'Unknown runtime environment. Where are we?';
}
function globalEval(x) {
  eval.call(null, x);
}
if (!Module['load'] == 'undefined' && Module['read']) {
  Module['load'] = function(f) {
    globalEval(Module['read'](f));
  };
}
if (!Module['print']) {
  Module['print'] = function(){};
}
if (!Module['printErr']) {
  Module['printErr'] = Module['print'];
}
if (!Module['arguments']) {
  Module['arguments'] = [];
}
// *** Environment setup code ***
// Closure helpers
Module.print = Module['print'];
Module.printErr = Module['printErr'];
// Callbacks
if (!Module['preRun']) Module['preRun'] = [];
if (!Module['postRun']) Module['postRun'] = [];
// === Auto-generated preamble library stuff ===
//========================================
// Runtime code shared with compiler
//========================================
var Runtime = {
  stackSave: function () {
    return STACKTOP;
  },
  stackRestore: function (stackTop) {
    STACKTOP = stackTop;
  },
  forceAlign: function (target, quantum) {
    quantum = quantum || 4;
    if (quantum == 1) return target;
    if (isNumber(target) && isNumber(quantum)) {
      return Math.ceil(target/quantum)*quantum;
    } else if (isNumber(quantum) && isPowerOfTwo(quantum)) {
      var logg = log2(quantum);
      return '((((' +target + ')+' + (quantum-1) + ')>>' + logg + ')<<' + logg + ')';
    }
    return 'Math.ceil((' + target + ')/' + quantum + ')*' + quantum;
  },
  isNumberType: function (type) {
    return type in Runtime.INT_TYPES || type in Runtime.FLOAT_TYPES;
  },
  isPointerType: function isPointerType(type) {
  return type[type.length-1] == '*';
},
  isStructType: function isStructType(type) {
  if (isPointerType(type)) return false;
  if (/^\[\d+\ x\ (.*)\]/.test(type)) return true; // [15 x ?] blocks. Like structs
  if (/<?{ ?[^}]* ?}>?/.test(type)) return true; // { i32, i8 } etc. - anonymous struct types
  // See comment in isStructPointerType()
  return type[0] == '%';
},
  INT_TYPES: {"i1":0,"i8":0,"i16":0,"i32":0,"i64":0},
  FLOAT_TYPES: {"float":0,"double":0},
  or64: function (x, y) {
    var l = (x | 0) | (y | 0);
    var h = (Math.round(x / 4294967296) | Math.round(y / 4294967296)) * 4294967296;
    return l + h;
  },
  and64: function (x, y) {
    var l = (x | 0) & (y | 0);
    var h = (Math.round(x / 4294967296) & Math.round(y / 4294967296)) * 4294967296;
    return l + h;
  },
  xor64: function (x, y) {
    var l = (x | 0) ^ (y | 0);
    var h = (Math.round(x / 4294967296) ^ Math.round(y / 4294967296)) * 4294967296;
    return l + h;
  },
  getNativeTypeSize: function (type, quantumSize) {
    if (Runtime.QUANTUM_SIZE == 1) return 1;
    var size = {
      '%i1': 1,
      '%i8': 1,
      '%i16': 2,
      '%i32': 4,
      '%i64': 8,
      "%float": 4,
      "%double": 8
    }['%'+type]; // add '%' since float and double confuse Closure compiler as keys, and also spidermonkey as a compiler will remove 's from '_i8' etc
    if (!size) {
      if (type.charAt(type.length-1) == '*') {
        size = Runtime.QUANTUM_SIZE; // A pointer
      } else if (type[0] == 'i') {
        var bits = parseInt(type.substr(1));
        assert(bits % 8 == 0);
        size = bits/8;
      }
    }
    return size;
  },
  getNativeFieldSize: function (type) {
    return Math.max(Runtime.getNativeTypeSize(type), Runtime.QUANTUM_SIZE);
  },
  dedup: function dedup(items, ident) {
  var seen = {};
  if (ident) {
    return items.filter(function(item) {
      if (seen[item[ident]]) return false;
      seen[item[ident]] = true;
      return true;
    });
  } else {
    return items.filter(function(item) {
      if (seen[item]) return false;
      seen[item] = true;
      return true;
    });
  }
},
  set: function set() {
  var args = typeof arguments[0] === 'object' ? arguments[0] : arguments;
  var ret = {};
  for (var i = 0; i < args.length; i++) {
    ret[args[i]] = 0;
  }
  return ret;
},
  calculateStructAlignment: function calculateStructAlignment(type) {
    type.flatSize = 0;
    type.alignSize = 0;
    var diffs = [];
    var prev = -1;
    type.flatIndexes = type.fields.map(function(field) {
      var size, alignSize;
      if (Runtime.isNumberType(field) || Runtime.isPointerType(field)) {
        size = Runtime.getNativeTypeSize(field); // pack char; char; in structs, also char[X]s.
        alignSize = size;
      } else if (Runtime.isStructType(field)) {
        size = Types.types[field].flatSize;
        alignSize = Types.types[field].alignSize;
      } else if (field[0] == 'b') {
        // bN, large number field, like a [N x i8]
        size = field.substr(1)|0;
        alignSize = 1;
      } else {
        throw 'Unclear type in struct: ' + field + ', in ' + type.name_ + ' :: ' + dump(Types.types[type.name_]);
      }
      alignSize = type.packed ? 1 : Math.min(alignSize, Runtime.QUANTUM_SIZE);
      type.alignSize = Math.max(type.alignSize, alignSize);
      var curr = Runtime.alignMemory(type.flatSize, alignSize); // if necessary, place this on aligned memory
      type.flatSize = curr + size;
      if (prev >= 0) {
        diffs.push(curr-prev);
      }
      prev = curr;
      return curr;
    });
    type.flatSize = Runtime.alignMemory(type.flatSize, type.alignSize);
    if (diffs.length == 0) {
      type.flatFactor = type.flatSize;
    } else if (Runtime.dedup(diffs).length == 1) {
      type.flatFactor = diffs[0];
    }
    type.needsFlattening = (type.flatFactor != 1);
    return type.flatIndexes;
  },
  generateStructInfo: function (struct, typeName, offset) {
    var type, alignment;
    if (typeName) {
      offset = offset || 0;
      type = (typeof Types === 'undefined' ? Runtime.typeInfo : Types.types)[typeName];
      if (!type) return null;
      if (type.fields.length != struct.length) {
        printErr('Number of named fields must match the type for ' + typeName + ': possibly duplicate struct names. Cannot return structInfo');
        return null;
      }
      alignment = type.flatIndexes;
    } else {
      var type = { fields: struct.map(function(item) { return item[0] }) };
      alignment = Runtime.calculateStructAlignment(type);
    }
    var ret = {
      __size__: type.flatSize
    };
    if (typeName) {
      struct.forEach(function(item, i) {
        if (typeof item === 'string') {
          ret[item] = alignment[i] + offset;
        } else {
          // embedded struct
          var key;
          for (var k in item) key = k;
          ret[key] = Runtime.generateStructInfo(item[key], type.fields[i], alignment[i]);
        }
      });
    } else {
      struct.forEach(function(item, i) {
        ret[item[1]] = alignment[i];
      });
    }
    return ret;
  },
  dynCall: function (sig, ptr, args) {
    if (args && args.length) {
      return FUNCTION_TABLE[ptr].apply(null, args);
    } else {
      return FUNCTION_TABLE[ptr]();
    }
  },
  addFunction: function (func, sig) {
    //assert(sig); // TODO: support asm
    var table = FUNCTION_TABLE; // TODO: support asm
    var ret = table.length;
    table.push(func);
    table.push(0);
    return ret;
  },
  removeFunction: function (index) {
    var table = FUNCTION_TABLE; // TODO: support asm
    table[index] = null;
  },
  warnOnce: function (text) {
    if (!Runtime.warnOnce.shown) Runtime.warnOnce.shown = {};
    if (!Runtime.warnOnce.shown[text]) {
      Runtime.warnOnce.shown[text] = 1;
      Module.printErr(text);
    }
  },
  funcWrappers: {},
  getFuncWrapper: function (func, sig) {
    assert(sig);
    if (!Runtime.funcWrappers[func]) {
      Runtime.funcWrappers[func] = function() {
        Runtime.dynCall(sig, func, arguments);
      };
    }
    return Runtime.funcWrappers[func];
  },
  UTF8Processor: function () {
    var buffer = [];
    var needed = 0;
    this.processCChar = function (code) {
      code = code & 0xff;
      if (needed) {
        buffer.push(code);
        needed--;
      }
      if (buffer.length == 0) {
        if (code < 128) return String.fromCharCode(code);
        buffer.push(code);
        if (code > 191 && code < 224) {
          needed = 1;
        } else {
          needed = 2;
        }
        return '';
      }
      if (needed > 0) return '';
      var c1 = buffer[0];
      var c2 = buffer[1];
      var c3 = buffer[2];
      var ret;
      if (c1 > 191 && c1 < 224) {
        ret = String.fromCharCode(((c1 & 31) << 6) | (c2 & 63));
      } else {
        ret = String.fromCharCode(((c1 & 15) << 12) | ((c2 & 63) << 6) | (c3 & 63));
      }
      buffer.length = 0;
      return ret;
    }
    this.processJSString = function(string) {
      string = unescape(encodeURIComponent(string));
      var ret = [];
      for (var i = 0; i < string.length; i++) {
        ret.push(string.charCodeAt(i));
      }
      return ret;
    }
  },
  stackAlloc: function (size) { var ret = STACKTOP;STACKTOP = (STACKTOP + size)|0;STACKTOP = ((((STACKTOP)+3)>>2)<<2); return ret; },
  staticAlloc: function (size) { var ret = STATICTOP;STATICTOP = (STATICTOP + size)|0;STATICTOP = ((((STATICTOP)+3)>>2)<<2); if (STATICTOP >= TOTAL_MEMORY) enlargeMemory();; return ret; },
  alignMemory: function (size,quantum) { var ret = size = Math.ceil((size)/(quantum ? quantum : 4))*(quantum ? quantum : 4); return ret; },
  makeBigInt: function (low,high,unsigned) { var ret = (unsigned ? (((low)>>>(0))+(((high)>>>(0))*4294967296)) : (((low)>>>(0))+(((high)|(0))*4294967296))); return ret; },
  QUANTUM_SIZE: 4,
  __dummy__: 0
}
//========================================
// Runtime essentials
//========================================
var __THREW__ = 0; // Used in checking for thrown exceptions.
var setjmpId = 1; // Used in setjmp/longjmp
var setjmpLabels = {};
var ABORT = false;
var undef = 0;
// tempInt is used for 32-bit signed values or smaller. tempBigInt is used
// for 32-bit unsigned values or more than 32 bits. TODO: audit all uses of tempInt
var tempValue, tempInt, tempBigInt, tempInt2, tempBigInt2, tempPair, tempBigIntI, tempBigIntR, tempBigIntS, tempBigIntP, tempBigIntD;
var tempI64, tempI64b;
var tempRet0, tempRet1, tempRet2, tempRet3, tempRet4, tempRet5, tempRet6, tempRet7, tempRet8, tempRet9;
function abort(text) {
  Module.print(text + ':\n' + (new Error).stack);
  ABORT = true;
  throw "Assertion: " + text;
}
function assert(condition, text) {
  if (!condition) {
    abort('Assertion failed: ' + text);
  }
}
var globalScope = this;
// C calling interface. A convenient way to call C functions (in C files, or
// defined with extern "C").
//
// Note: LLVM optimizations can inline and remove functions, after which you will not be
//       able to call them. Closure can also do so. To avoid that, add your function to
//       the exports using something like
//
//         -s EXPORTED_FUNCTIONS='["_main", "_myfunc"]'
//
// @param ident      The name of the C function (note that C++ functions will be name-mangled - use extern "C")
// @param returnType The return type of the function, one of the JS types 'number', 'string' or 'array' (use 'number' for any C pointer, and
//                   'array' for JavaScript arrays and typed arrays).
// @param argTypes   An array of the types of arguments for the function (if there are no arguments, this can be ommitted). Types are as in returnType,
//                   except that 'array' is not possible (there is no way for us to know the length of the array)
// @param args       An array of the arguments to the function, as native JS values (as in returnType)
//                   Note that string arguments will be stored on the stack (the JS string will become a C string on the stack).
// @return           The return value, as a native JS value (as in returnType)
function ccall(ident, returnType, argTypes, args) {
  return ccallFunc(getCFunc(ident), returnType, argTypes, args);
}
Module["ccall"] = ccall;
// Returns the C function with a specified identifier (for C++, you need to do manual name mangling)
function getCFunc(ident) {
  try {
    var func = globalScope['Module']['_' + ident]; // closure exported function
    if (!func) func = eval('_' + ident); // explicit lookup
  } catch(e) {
  }
  assert(func, 'Cannot call unknown function ' + ident + ' (perhaps LLVM optimizations or closure removed it?)');
  return func;
}
// Internal function that does a C call using a function, not an identifier
function ccallFunc(func, returnType, argTypes, args) {
  var stack = 0;
  function toC(value, type) {
    if (type == 'string') {
      if (value === null || value === undefined || value === 0) return 0; // null string
      if (!stack) stack = Runtime.stackSave();
      var ret = Runtime.stackAlloc(value.length+1);
      writeStringToMemory(value, ret);
      return ret;
    } else if (type == 'array') {
      if (!stack) stack = Runtime.stackSave();
      var ret = Runtime.stackAlloc(value.length);
      writeArrayToMemory(value, ret);
      return ret;
    }
    return value;
  }
  function fromC(value, type) {
    if (type == 'string') {
      return Pointer_stringify(value);
    }
    assert(type != 'array');
    return value;
  }
  var i = 0;
  var cArgs = args ? args.map(function(arg) {
    return toC(arg, argTypes[i++]);
  }) : [];
  var ret = fromC(func.apply(null, cArgs), returnType);
  if (stack) Runtime.stackRestore(stack);
  return ret;
}
// Returns a native JS wrapper for a C function. This is similar to ccall, but
// returns a function you can call repeatedly in a normal way. For example:
//
//   var my_function = cwrap('my_c_function', 'number', ['number', 'number']);
//   alert(my_function(5, 22));
//   alert(my_function(99, 12));
//
function cwrap(ident, returnType, argTypes) {
  var func = getCFunc(ident);
  return function() {
    return ccallFunc(func, returnType, argTypes, Array.prototype.slice.call(arguments));
  }
}
Module["cwrap"] = cwrap;
// Sets a value in memory in a dynamic way at run-time. Uses the
// type data. This is the same as makeSetValue, except that
// makeSetValue is done at compile-time and generates the needed
// code then, whereas this function picks the right code at
// run-time.
// Note that setValue and getValue only do *aligned* writes and reads!
// Note that ccall uses JS types as for defining types, while setValue and
// getValue need LLVM types ('i8', 'i32') - this is a lower-level operation
function setValue(ptr, value, type, noSafe) {
  type = type || 'i8';
  if (type.charAt(type.length-1) === '*') type = 'i32'; // pointers are 32-bit
    switch(type) {
      case 'i1': HEAP8[(ptr)]=value; break;
      case 'i8': HEAP8[(ptr)]=value; break;
      case 'i16': HEAP16[((ptr)>>1)]=value; break;
      case 'i32': HEAP32[((ptr)>>2)]=value; break;
      case 'i64': (tempI64 = [value>>>0,Math.min(Math.floor((value)/4294967296), 4294967295)>>>0],HEAP32[((ptr)>>2)]=tempI64[0],HEAP32[(((ptr)+(4))>>2)]=tempI64[1]); break;
      case 'float': HEAPF32[((ptr)>>2)]=value; break;
      case 'double': (HEAPF64[(tempDoublePtr)>>3]=value,HEAP32[((ptr)>>2)]=HEAP32[((tempDoublePtr)>>2)],HEAP32[(((ptr)+(4))>>2)]=HEAP32[(((tempDoublePtr)+(4))>>2)]); break;
      default: abort('invalid type for setValue: ' + type);
    }
}
Module['setValue'] = setValue;
// Parallel to setValue.
function getValue(ptr, type, noSafe) {
  type = type || 'i8';
  if (type.charAt(type.length-1) === '*') type = 'i32'; // pointers are 32-bit
    switch(type) {
      case 'i1': return HEAP8[(ptr)];
      case 'i8': return HEAP8[(ptr)];
      case 'i16': return HEAP16[((ptr)>>1)];
      case 'i32': return HEAP32[((ptr)>>2)];
      case 'i64': return HEAP32[((ptr)>>2)];
      case 'float': return HEAPF32[((ptr)>>2)];
      case 'double': return (HEAP32[((tempDoublePtr)>>2)]=HEAP32[((ptr)>>2)],HEAP32[(((tempDoublePtr)+(4))>>2)]=HEAP32[(((ptr)+(4))>>2)],HEAPF64[(tempDoublePtr)>>3]);
      default: abort('invalid type for setValue: ' + type);
    }
  return null;
}
Module['getValue'] = getValue;
var ALLOC_NORMAL = 0; // Tries to use _malloc()
var ALLOC_STACK = 1; // Lives for the duration of the current function call
var ALLOC_STATIC = 2; // Cannot be freed
var ALLOC_NONE = 3; // Do not allocate
Module['ALLOC_NORMAL'] = ALLOC_NORMAL;
Module['ALLOC_STACK'] = ALLOC_STACK;
Module['ALLOC_STATIC'] = ALLOC_STATIC;
Module['ALLOC_NONE'] = ALLOC_NONE;
// allocate(): This is for internal use. You can use it yourself as well, but the interface
//             is a little tricky (see docs right below). The reason is that it is optimized
//             for multiple syntaxes to save space in generated code. So you should
//             normally not use allocate(), and instead allocate memory using _malloc(),
//             initialize it with setValue(), and so forth.
// @slab: An array of data, or a number. If a number, then the size of the block to allocate,
//        in *bytes* (note that this is sometimes confusing: the next parameter does not
//        affect this!)
// @types: Either an array of types, one for each byte (or 0 if no type at that position),
//         or a single type which is used for the entire block. This only matters if there
//         is initial data - if @slab is a number, then this does not matter at all and is
//         ignored.
// @allocator: How to allocate memory, see ALLOC_*
function allocate(slab, types, allocator, ptr) {
  var zeroinit, size;
  if (typeof slab === 'number') {
    zeroinit = true;
    size = slab;
  } else {
    zeroinit = false;
    size = slab.length;
  }
  var singleType = typeof types === 'string' ? types : null;
  var ret;
  if (allocator == ALLOC_NONE) {
    ret = ptr;
  } else {
    ret = [_malloc, Runtime.stackAlloc, Runtime.staticAlloc][allocator === undefined ? ALLOC_STATIC : allocator](Math.max(size, singleType ? 1 : types.length));
  }
  if (zeroinit) {
    var ptr = ret, stop;
    assert((ret & 3) == 0);
    stop = ret + (size & ~3);
    for (; ptr < stop; ptr += 4) {
      HEAP32[((ptr)>>2)]=0;
    }
    stop = ret + size;
    while (ptr < stop) {
      HEAP8[((ptr++)|0)]=0;
    }
    return ret;
  }
  if (singleType === 'i8') {
    HEAPU8.set(new Uint8Array(slab), ret);
    return ret;
  }
  var i = 0, type, typeSize, previousType;
  while (i < size) {
    var curr = slab[i];
    if (typeof curr === 'function') {
      curr = Runtime.getFunctionIndex(curr);
    }
    type = singleType || types[i];
    if (type === 0) {
      i++;
      continue;
    }
    if (type == 'i64') type = 'i32'; // special case: we have one i32 here, and one i32 later
    setValue(ret+i, curr, type);
    // no need to look up size unless type changes, so cache it
    if (previousType !== type) {
      typeSize = Runtime.getNativeTypeSize(type);
      previousType = type;
    }
    i += typeSize;
  }
  return ret;
}
Module['allocate'] = allocate;
function Pointer_stringify(ptr, /* optional */ length) {
  // Find the length, and check for UTF while doing so
  var hasUtf = false;
  var t;
  var i = 0;
  while (1) {
    t = HEAPU8[(((ptr)+(i))|0)];
    if (t >= 128) hasUtf = true;
    else if (t == 0 && !length) break;
    i++;
    if (length && i == length) break;
  }
  if (!length) length = i;
  var ret = '';
  if (!hasUtf) {
    var MAX_CHUNK = 1024; // split up into chunks, because .apply on a huge string can overflow the stack
    var curr;
    while (length > 0) {
      curr = String.fromCharCode.apply(String, HEAPU8.subarray(ptr, ptr + Math.min(length, MAX_CHUNK)));
      ret = ret ? ret + curr : curr;
      ptr += MAX_CHUNK;
      length -= MAX_CHUNK;
    }
    return ret;
  }
  var utf8 = new Runtime.UTF8Processor();
  for (i = 0; i < length; i++) {
    t = HEAPU8[(((ptr)+(i))|0)];
    ret += utf8.processCChar(t);
  }
  return ret;
}
Module['Pointer_stringify'] = Pointer_stringify;
// Memory management
var PAGE_SIZE = 4096;
function alignMemoryPage(x) {
  return ((x+4095)>>12)<<12;
}
var HEAP;
var HEAP8, HEAPU8, HEAP16, HEAPU16, HEAP32, HEAPU32, HEAPF32, HEAPF64;
var STACK_ROOT, STACKTOP, STACK_MAX;
var STATICTOP;
function enlargeMemory() {
  abort('Cannot enlarge memory arrays. Either (1) compile with -s TOTAL_MEMORY=X with X higher than the current value, (2) compile with ALLOW_MEMORY_GROWTH which adjusts the size at runtime but prevents some optimizations, or (3) set Module.TOTAL_MEMORY before the program runs.');
}
var TOTAL_STACK = Module['TOTAL_STACK'] || 409600;
var TOTAL_MEMORY = Module['TOTAL_MEMORY'] || 1048576;
var FAST_MEMORY = Module['FAST_MEMORY'] || 2097152;
// Initialize the runtime's memory
// check for full engine support (use string 'subarray' to avoid closure compiler confusion)
assert(!!Int32Array && !!Float64Array && !!(new Int32Array(1)['subarray']) && !!(new Int32Array(1)['set']),
       'Cannot fallback to non-typed array case: Code is too specialized');
var buffer = new ArrayBuffer(TOTAL_MEMORY);
HEAP8 = new Int8Array(buffer);
HEAP16 = new Int16Array(buffer);
HEAP32 = new Int32Array(buffer);
HEAPU8 = new Uint8Array(buffer);
HEAPU16 = new Uint16Array(buffer);
HEAPU32 = new Uint32Array(buffer);
HEAPF32 = new Float32Array(buffer);
HEAPF64 = new Float64Array(buffer);
// Endianness check (note: assumes compiler arch was little-endian)
HEAP32[0] = 255;
assert(HEAPU8[0] === 255 && HEAPU8[3] === 0, 'Typed arrays 2 must be run on a little-endian system');
Module['HEAP'] = HEAP;
Module['HEAP8'] = HEAP8;
Module['HEAP16'] = HEAP16;
Module['HEAP32'] = HEAP32;
Module['HEAPU8'] = HEAPU8;
Module['HEAPU16'] = HEAPU16;
Module['HEAPU32'] = HEAPU32;
Module['HEAPF32'] = HEAPF32;
Module['HEAPF64'] = HEAPF64;
STACK_ROOT = STACKTOP = Runtime.alignMemory(1);
STACK_MAX = TOTAL_STACK; // we lose a little stack here, but TOTAL_STACK is nice and round so use that as the max
var tempDoublePtr = Runtime.alignMemory(allocate(12, 'i8', ALLOC_STACK), 8);
assert(tempDoublePtr % 8 == 0);
function copyTempFloat(ptr) { // functions, because inlining this code increases code size too much
  HEAP8[tempDoublePtr] = HEAP8[ptr];
  HEAP8[tempDoublePtr+1] = HEAP8[ptr+1];
  HEAP8[tempDoublePtr+2] = HEAP8[ptr+2];
  HEAP8[tempDoublePtr+3] = HEAP8[ptr+3];
}
function copyTempDouble(ptr) {
  HEAP8[tempDoublePtr] = HEAP8[ptr];
  HEAP8[tempDoublePtr+1] = HEAP8[ptr+1];
  HEAP8[tempDoublePtr+2] = HEAP8[ptr+2];
  HEAP8[tempDoublePtr+3] = HEAP8[ptr+3];
  HEAP8[tempDoublePtr+4] = HEAP8[ptr+4];
  HEAP8[tempDoublePtr+5] = HEAP8[ptr+5];
  HEAP8[tempDoublePtr+6] = HEAP8[ptr+6];
  HEAP8[tempDoublePtr+7] = HEAP8[ptr+7];
}
STATICTOP = STACK_MAX;
assert(STATICTOP < TOTAL_MEMORY); // Stack must fit in TOTAL_MEMORY; allocations from here on may enlarge TOTAL_MEMORY
var nullString = allocate(intArrayFromString('(null)'), 'i8', ALLOC_STACK);
function callRuntimeCallbacks(callbacks) {
  while(callbacks.length > 0) {
    var callback = callbacks.shift();
    var func = callback.func;
    if (typeof func === 'number') {
      if (callback.arg === undefined) {
        Runtime.dynCall('v', func);
      } else {
        Runtime.dynCall('vi', func, [callback.arg]);
      }
    } else {
      func(callback.arg === undefined ? null : callback.arg);
    }
  }
}
var __ATINIT__ = []; // functions called during startup
var __ATMAIN__ = []; // functions called when main() is to be run
var __ATEXIT__ = []; // functions called during shutdown
function initRuntime() {
  callRuntimeCallbacks(__ATINIT__);
}
function preMain() {
  callRuntimeCallbacks(__ATMAIN__);
}
function exitRuntime() {
  callRuntimeCallbacks(__ATEXIT__);
}
// Tools
// This processes a JS string into a C-line array of numbers, 0-terminated.
// For LLVM-originating strings, see parser.js:parseLLVMString function
function intArrayFromString(stringy, dontAddNull, length /* optional */) {
  var ret = (new Runtime.UTF8Processor()).processJSString(stringy);
  if (length) {
    ret.length = length;
  }
  if (!dontAddNull) {
    ret.push(0);
  }
  return ret;
}
Module['intArrayFromString'] = intArrayFromString;
function intArrayToString(array) {
  var ret = [];
  for (var i = 0; i < array.length; i++) {
    var chr = array[i];
    if (chr > 0xFF) {
      chr &= 0xFF;
    }
    ret.push(String.fromCharCode(chr));
  }
  return ret.join('');
}
Module['intArrayToString'] = intArrayToString;
// Write a Javascript array to somewhere in the heap
function writeStringToMemory(string, buffer, dontAddNull) {
  var array = intArrayFromString(string, dontAddNull);
  var i = 0;
  while (i < array.length) {
    var chr = array[i];
    HEAP8[(((buffer)+(i))|0)]=chr
    i = i + 1;
  }
}
Module['writeStringToMemory'] = writeStringToMemory;
function writeArrayToMemory(array, buffer) {
  for (var i = 0; i < array.length; i++) {
    HEAP8[(((buffer)+(i))|0)]=array[i];
  }
}
Module['writeArrayToMemory'] = writeArrayToMemory;
function unSign(value, bits, ignore, sig) {
  if (value >= 0) {
    return value;
  }
  return bits <= 32 ? 2*Math.abs(1 << (bits-1)) + value // Need some trickery, since if bits == 32, we are right at the limit of the bits JS uses in bitshifts
                    : Math.pow(2, bits)         + value;
}
function reSign(value, bits, ignore, sig) {
  if (value <= 0) {
    return value;
  }
  var half = bits <= 32 ? Math.abs(1 << (bits-1)) // abs is needed if bits == 32
                        : Math.pow(2, bits-1);
  if (value >= half && (bits <= 32 || value > half)) { // for huge values, we can hit the precision limit and always get true here. so don't do that
                                                       // but, in general there is no perfect solution here. With 64-bit ints, we get rounding and errors
                                                       // TODO: In i64 mode 1, resign the two parts separately and safely
    value = -2*half + value; // Cannot bitshift half, as it may be at the limit of the bits JS uses in bitshifts
  }
  return value;
}
if (!Math.imul) Math.imul = function(a, b) {
  var ah  = a >>> 16;
  var al = a & 0xffff;
  var bh  = b >>> 16;
  var bl = b & 0xffff;
  return (al*bl + ((ah*bl + al*bh) << 16))|0;
};
// A counter of dependencies for calling run(). If we need to
// do asynchronous work before running, increment this and
// decrement it. Incrementing must happen in a place like
// PRE_RUN_ADDITIONS (used by emcc to add file preloading).
// Note that you can add dependencies in preRun, even though
// it happens right before run - run will be postponed until
// the dependencies are met.
var runDependencies = 0;
var runDependencyTracking = {};
var calledRun = false;
var runDependencyWatcher = null;
function addRunDependency(id) {
  runDependencies++;
  if (Module['monitorRunDependencies']) {
    Module['monitorRunDependencies'](runDependencies);
  }
  if (id) {
    assert(!runDependencyTracking[id]);
    runDependencyTracking[id] = 1;
    if (runDependencyWatcher === null && typeof setInterval !== 'undefined') {
      // Check for missing dependencies every few seconds
      runDependencyWatcher = setInterval(function() {
        var shown = false;
        for (var dep in runDependencyTracking) {
          if (!shown) {
            shown = true;
            Module.printErr('still waiting on run dependencies:');
          }
          Module.printErr('dependency: ' + dep);
        }
        if (shown) {
          Module.printErr('(end of list)');
        }
      }, 6000);
    }
  } else {
    Module.printErr('warning: run dependency added without ID');
  }
}
Module['addRunDependency'] = addRunDependency;
function removeRunDependency(id) {
  runDependencies--;
  if (Module['monitorRunDependencies']) {
    Module['monitorRunDependencies'](runDependencies);
  }
  if (id) {
    assert(runDependencyTracking[id]);
    delete runDependencyTracking[id];
  } else {
    Module.printErr('warning: run dependency removed without ID');
  }
  if (runDependencies == 0) {
    if (runDependencyWatcher !== null) {
      clearInterval(runDependencyWatcher);
      runDependencyWatcher = null;
    } 
    // If run has never been called, and we should call run (INVOKE_RUN is true, and Module.noInitialRun is not false)
    if (!calledRun && shouldRunNow) run();
  }
}
Module['removeRunDependency'] = removeRunDependency;
Module["preloadedImages"] = {}; // maps url to image data
Module["preloadedAudios"] = {}; // maps url to audio data
// === Body ===
assert(STATICTOP == STACK_MAX); assert(STACK_MAX == TOTAL_STACK);
STATICTOP += 2412;
assert(STATICTOP < TOTAL_MEMORY);
var _stderr;
var ___progname;
var __ZTVSt9exception;
var __ZTVN10__cxxabiv120__si_class_type_infoE;
var __ZTISt9exception;
var __ZNSt9bad_allocC1Ev;
var __ZNSt9bad_allocD1Ev;
var __ZNSt20bad_array_new_lengthC1Ev;
var __ZNSt20bad_array_new_lengthD1Ev;
var __ZNSt20bad_array_new_lengthD2Ev;
var _err;
var _errx;
var _warn1;
var _warnx;
var _verr;
var _verrx;
var _vwarn;
var _vwarnx;
allocate(4, "i8", ALLOC_NONE, 409600);
allocate([111,112,116,105,111,110,32,114,101,113,117,105,114,101,115,32,97,110,32,97,114,103,117,109,101,110,116,32,45,45,32,37,115,0] /* option requires an a */, "i8", ALLOC_NONE, 409604);
allocate([111,112,116,105,111,110,32,114,101,113,117,105,114,101,115,32,97,110,32,97,114,103,117,109,101,110,116,32,45,45,32,37,99,0] /* option requires an a */, "i8", ALLOC_NONE, 409640);
allocate([0,0,0,0,0,0,36,64,0,0,0,0,0,0,89,64,0,0,0,0,0,136,195,64,0,0,0,0,132,215,151,65,0,128,224,55,121,195,65,67,23,110,5,181,181,184,147,70,245,249,63,233,3,79,56,77,50,29,48,249,72,119,130,90,60,191,115,127,221,79,21,117], "i8", ALLOC_NONE, 409676);
allocate(4, "i8", ALLOC_NONE, 409748);
allocate(4, "i8", ALLOC_NONE, 409752);
allocate([63,0,0,0], "i8", ALLOC_NONE, 409756);
allocate([1,0,0,0], "i8", ALLOC_NONE, 409760);
allocate([1,0,0,0], "i8", ALLOC_NONE, 409764);
allocate(4, "i8", ALLOC_NONE, 409768);
allocate([255,255,255,255], "i8", ALLOC_NONE, 409772);
allocate([255,255,255,255], "i8", ALLOC_NONE, 409776);
allocate([111,112,116,105,111,110,32,100,111,101,115,110,39,116,32,116,97,107,101,32,97,110,32,97,114,103,117,109,101,110,116,32,45,45,32,37,46,42,115,0] /* option doesn't take  */, "i8", ALLOC_NONE, 409780);
allocate(24, "i8", ALLOC_NONE, 409820);
allocate([0,0,0,0,0,0,0,0,0,0,0,0,10,0,0,0], ["*",0,0,0,"*",0,0,0,"*",0,0,0,"*",0,0,0], ALLOC_NONE, 409844);
allocate(4, "i8", ALLOC_NONE, 409860);
allocate([117,110,107,110,111,119,110,32,111,112,116,105,111,110,32,45,45,32,37,115,0] /* unknown option -- %s */, "i8", ALLOC_NONE, 409864);
allocate([117,110,107,110,111,119,110,32,111,112,116,105,111,110,32,45,45,32,37,99,0] /* unknown option -- %c */, "i8", ALLOC_NONE, 409888);
allocate([255,255,255,255], "i8", ALLOC_NONE, 409912);
allocate(76, "i8", ALLOC_NONE, 409916);
allocate(1024, "i8", ALLOC_NONE, 409992);
allocate([0,0,0,0,8,0,0,0,48,0,0,0,44,0,0,0,8,0,0,0,4,0,0,0,6,0,0,0,8,0,0,0,24,0,0,0,8,0,0,0,12,0,0,0,16,0,0,0,24,0,0,0], "i8", ALLOC_NONE, 411016);
allocate(4, "i8", ALLOC_NONE, 411068);
allocate([40], ["void ()*",0,0,0], ALLOC_NONE, 411072);
allocate([30], ["void (i8*)*",0,0,0], ALLOC_NONE, 411076);
allocate([42], ["i8* (i32)*",0,0,0], ALLOC_NONE, 411080);
allocate([97,109,98,105,103,117,111,117,115,32,111,112,116,105,111,110,32,45,45,32,37,46,42,115,0] /* ambiguous option --  */, "i8", ALLOC_NONE, 411084);
allocate([37,115,58,32,0] /* %s: \00 */, "i8", ALLOC_NONE, 411112);
allocate([80,79,83,73,88,76,89,95,67,79,82,82,69,67,84,0] /* POSIXLY_CORRECT\00 */, "i8", ALLOC_NONE, 411120);
allocate([109,97,120,32,115,121,115,116,101,109,32,98,121,116,101,115,32,61,32,37,49,48,108,117,10,0] /* max system bytes = % */, "i8", ALLOC_NONE, 411136);
allocate([115,116,100,58,58,98,97,100,95,97,108,108,111,99,0] /* std::bad_alloc\00 */, "i8", ALLOC_NONE, 411164);
allocate([105,110,32,117,115,101,32,98,121,116,101,115,32,32,32,32,32,61,32,37,49,48,108,117,10,0] /* in use bytes     = % */, "i8", ALLOC_NONE, 411180);
allocate([37,115,58,32,0] /* %s: \00 */, "i8", ALLOC_NONE, 411208);
allocate([37,115,10,0] /* %s\0A\00 */, "i8", ALLOC_NONE, 411216);
allocate([37,115,10,0] /* %s\0A\00 */, "i8", ALLOC_NONE, 411220);
allocate([69,114,114,111,114,32,114,101,99,101,105,118,105,110,103,32,105,110,99,111,109,105,110,103,32,112,97,99,107,101,116,115,0] /* Error receiving inco */, "i8", ALLOC_NONE, 411224);
allocate([37,115,58,32,0] /* %s: \00 */, "i8", ALLOC_NONE, 411260);
allocate(1, "i8", ALLOC_NONE, 411268);
allocate([37,115,58,32,0] /* %s: \00 */, "i8", ALLOC_NONE, 411272);
allocate([115,121,115,116,101,109,32,98,121,116,101,115,32,32,32,32,32,61,32,37,49,48,108,117,10,0] /* system bytes     = % */, "i8", ALLOC_NONE, 411280);
allocate([98,97,100,95,97,114,114,97,121,95,110,101,119,95,108,101,110,103,116,104,0] /* bad_array_new_length */, "i8", ALLOC_NONE, 411308);
allocate([10,0] /* \0A\00 */, "i8", ALLOC_NONE, 411332);
allocate([58,32,0] /* : \00 */, "i8", ALLOC_NONE, 411336);
allocate([10,0] /* \0A\00 */, "i8", ALLOC_NONE, 411340);
allocate([58,32,0] /* : \00 */, "i8", ALLOC_NONE, 411344);
allocate([69,114,114,111,114,32,115,101,110,100,105,110,103,32,111,117,116,103,111,105,110,103,32,112,97,99,107,101,116,115,0] /* Error sending outgoi */, "i8", ALLOC_NONE, 411348);
allocate([69,114,114,111,114,32,100,105,115,112,97,116,99,104,105,110,103,32,105,110,99,111,109,105,110,103,32,112,97,99,107,101,116,115,0] /* Error dispatching in */, "i8", ALLOC_NONE, 411380);
allocate(472, "i8", ALLOC_NONE, 411416);
allocate([0,0,0,0,76,73,6,0,0,0,0,0,0,0,0,0,0,0,0,0], "i8", ALLOC_NONE, 411888);
allocate(1, "i8", ALLOC_NONE, 411908);
allocate([0,0,0,0,88,73,6,0,0,0,0,0,0,0,0,0,0,0,0,0], "i8", ALLOC_NONE, 411912);
allocate(1, "i8", ALLOC_NONE, 411932);
allocate([83,116,57,98,97,100,95,97,108,108,111,99,0] /* St9bad_alloc\00 */, "i8", ALLOC_NONE, 411936);
allocate([83,116,50,48,98,97,100,95,97,114,114,97,121,95,110,101,119,95,108,101,110,103,116,104,0] /* St20bad_array_new_le */, "i8", ALLOC_NONE, 411952);
allocate(12, "i8", ALLOC_NONE, 411980);
allocate([0,0,0,0,0,0,0,0,76,73,6,0], "i8", ALLOC_NONE, 411992);
allocate(1, "i8", ALLOC_NONE, 412004);
allocate(4, "i8", ALLOC_NONE, 412008);
HEAP32[((409748)>>2)]=((411268)|0);
HEAP32[((411896)>>2)]=(36);
HEAP32[((411900)>>2)]=(6);
HEAP32[((411904)>>2)]=(18);
HEAP32[((411920)>>2)]=(36);
HEAP32[((411924)>>2)]=(2);
HEAP32[((411928)>>2)]=(38);
__ZTVN10__cxxabiv120__si_class_type_infoE=allocate([2,0,0,0], "i8", ALLOC_STATIC);
HEAP32[((411980)>>2)]=(((__ZTVN10__cxxabiv120__si_class_type_infoE+8)|0));
HEAP32[((411984)>>2)]=((411936)|0);
HEAP32[((411988)>>2)]=__ZTISt9exception;
HEAP32[((411992)>>2)]=(((__ZTVN10__cxxabiv120__si_class_type_infoE+8)|0));
HEAP32[((411996)>>2)]=((411952)|0);
__ZNSt9bad_allocC1Ev = 4;
__ZNSt9bad_allocD1Ev = 36;
__ZNSt20bad_array_new_lengthC1Ev = 26;
__ZNSt20bad_array_new_lengthD1Ev = (36);
__ZNSt20bad_array_new_lengthD2Ev = (36);
_err = 34;
_errx = 8;
_warn1 = 32;
_warnx = 44;
_verr = 20;
_verrx = 14;
_vwarn = 24;
_vwarnx = 22;
var __packet_filter; // stub for __packet_filter
  function _memcpy(dest, src, num) {
      dest = dest|0; src = src|0; num = num|0;
      var ret = 0;
      ret = dest|0;
      if ((dest&3) == (src&3)) {
        while (dest & 3) {
          if ((num|0) == 0) return ret|0;
          HEAP8[(dest)]=HEAP8[(src)];
          dest = (dest+1)|0;
          src = (src+1)|0;
          num = (num-1)|0;
        }
        while ((num|0) >= 4) {
          HEAP32[((dest)>>2)]=HEAP32[((src)>>2)];
          dest = (dest+4)|0;
          src = (src+4)|0;
          num = (num-4)|0;
        }
      }
      while ((num|0) > 0) {
        HEAP8[(dest)]=HEAP8[(src)];
        dest = (dest+1)|0;
        src = (src+1)|0;
        num = (num-1)|0;
      }
      return ret|0;
    }var _llvm_memcpy_p0i8_p0i8_i32=_memcpy;
  function _abort() {
      ABORT = true;
      throw 'abort() at ' + (new Error().stack);
    }
  function _memset(ptr, value, num) {
      ptr = ptr|0; value = value|0; num = num|0;
      var stop = 0, value4 = 0, stop4 = 0, unaligned = 0;
      stop = (ptr + num)|0;
      if ((num|0) >= 20) {
        // This is unaligned, but quite large, so work hard to get to aligned settings
        value = value & 0xff;
        unaligned = ptr & 3;
        value4 = value | (value << 8) | (value << 16) | (value << 24);
        stop4 = stop & ~3;
        if (unaligned) {
          unaligned = (ptr + 4 - unaligned)|0;
          while ((ptr|0) < (unaligned|0)) { // no need to check for stop, since we have large num
            HEAP8[(ptr)]=value;
            ptr = (ptr+1)|0;
          }
        }
        while ((ptr|0) < (stop4|0)) {
          HEAP32[((ptr)>>2)]=value4;
          ptr = (ptr+4)|0;
        }
      }
      while ((ptr|0) < (stop|0)) {
        HEAP8[(ptr)]=value;
        ptr = (ptr+1)|0;
      }
    }var _llvm_memset_p0i8_i32=_memset;
  function _time(ptr) {
      var ret = Math.floor(Date.now()/1000);
      if (ptr) {
        HEAP32[((ptr)>>2)]=ret
      }
      return ret;
    }
  function _htons(value) {
      return ((value & 0xff) << 8) + ((value & 0xff00) >> 8);
    }
  function _htonl(value) {
      return ((value & 0xff) << 24) + ((value & 0xff00) << 8) +
             ((value & 0xff0000) >>> 8) + ((value & 0xff000000) >>> 24);
    }
  var _ntohl=_htonl;
  var _ntohs=_htons;
  var ERRNO_CODES={E2BIG:7,EACCES:13,EADDRINUSE:98,EADDRNOTAVAIL:99,EAFNOSUPPORT:97,EAGAIN:11,EALREADY:114,EBADF:9,EBADMSG:74,EBUSY:16,ECANCELED:125,ECHILD:10,ECONNABORTED:103,ECONNREFUSED:111,ECONNRESET:104,EDEADLK:35,EDESTADDRREQ:89,EDOM:33,EDQUOT:122,EEXIST:17,EFAULT:14,EFBIG:27,EHOSTUNREACH:113,EIDRM:43,EILSEQ:84,EINPROGRESS:115,EINTR:4,EINVAL:22,EIO:5,EISCONN:106,EISDIR:21,ELOOP:40,EMFILE:24,EMLINK:31,EMSGSIZE:90,EMULTIHOP:72,ENAMETOOLONG:36,ENETDOWN:100,ENETRESET:102,ENETUNREACH:101,ENFILE:23,ENOBUFS:105,ENODATA:61,ENODEV:19,ENOENT:2,ENOEXEC:8,ENOLCK:37,ENOLINK:67,ENOMEM:12,ENOMSG:42,ENOPROTOOPT:92,ENOSPC:28,ENOSR:63,ENOSTR:60,ENOSYS:38,ENOTCONN:107,ENOTDIR:20,ENOTEMPTY:39,ENOTRECOVERABLE:131,ENOTSOCK:88,ENOTSUP:95,ENOTTY:25,ENXIO:6,EOVERFLOW:75,EOWNERDEAD:130,EPERM:1,EPIPE:32,EPROTO:71,EPROTONOSUPPORT:93,EPROTOTYPE:91,ERANGE:34,EROFS:30,ESPIPE:29,ESRCH:3,ESTALE:116,ETIME:62,ETIMEDOUT:110,ETXTBSY:26,EWOULDBLOCK:11,EXDEV:18};
  function ___setErrNo(value) {
      // For convenient setting and returning of errno.
      if (!___setErrNo.ret) ___setErrNo.ret = allocate([0], 'i32', ALLOC_STATIC);
      HEAP32[((___setErrNo.ret)>>2)]=value
      return value;
    }
  var _stdin=allocate(1, "i32*", ALLOC_STACK);
  var _stdout=allocate(1, "i32*", ALLOC_STACK);
  var _stderr=allocate(1, "i32*", ALLOC_STACK);
  var __impure_ptr=allocate(1, "i32*", ALLOC_STACK);var FS={currentPath:"/",nextInode:2,streams:[null],ignorePermissions:true,joinPath:function (parts, forceRelative) {
        var ret = parts[0];
        for (var i = 1; i < parts.length; i++) {
          if (ret[ret.length-1] != '/') ret += '/';
          ret += parts[i];
        }
        if (forceRelative && ret[0] == '/') ret = ret.substr(1);
        return ret;
      },absolutePath:function (relative, base) {
        if (typeof relative !== 'string') return null;
        if (base === undefined) base = FS.currentPath;
        if (relative && relative[0] == '/') base = '';
        var full = base + '/' + relative;
        var parts = full.split('/').reverse();
        var absolute = [''];
        while (parts.length) {
          var part = parts.pop();
          if (part == '' || part == '.') {
            // Nothing.
          } else if (part == '..') {
            if (absolute.length > 1) absolute.pop();
          } else {
            absolute.push(part);
          }
        }
        return absolute.length == 1 ? '/' : absolute.join('/');
      },analyzePath:function (path, dontResolveLastLink, linksVisited) {
        var ret = {
          isRoot: false,
          exists: false,
          error: 0,
          name: null,
          path: null,
          object: null,
          parentExists: false,
          parentPath: null,
          parentObject: null
        };
        path = FS.absolutePath(path);
        if (path == '/') {
          ret.isRoot = true;
          ret.exists = ret.parentExists = true;
          ret.name = '/';
          ret.path = ret.parentPath = '/';
          ret.object = ret.parentObject = FS.root;
        } else if (path !== null) {
          linksVisited = linksVisited || 0;
          path = path.slice(1).split('/');
          var current = FS.root;
          var traversed = [''];
          while (path.length) {
            if (path.length == 1 && current.isFolder) {
              ret.parentExists = true;
              ret.parentPath = traversed.length == 1 ? '/' : traversed.join('/');
              ret.parentObject = current;
              ret.name = path[0];
            }
            var target = path.shift();
            if (!current.isFolder) {
              ret.error = ERRNO_CODES.ENOTDIR;
              break;
            } else if (!current.read) {
              ret.error = ERRNO_CODES.EACCES;
              break;
            } else if (!current.contents.hasOwnProperty(target)) {
              ret.error = ERRNO_CODES.ENOENT;
              break;
            }
            current = current.contents[target];
            if (current.link && !(dontResolveLastLink && path.length == 0)) {
              if (linksVisited > 40) { // Usual Linux SYMLOOP_MAX.
                ret.error = ERRNO_CODES.ELOOP;
                break;
              }
              var link = FS.absolutePath(current.link, traversed.join('/'));
              ret = FS.analyzePath([link].concat(path).join('/'),
                                   dontResolveLastLink, linksVisited + 1);
              return ret;
            }
            traversed.push(target);
            if (path.length == 0) {
              ret.exists = true;
              ret.path = traversed.join('/');
              ret.object = current;
            }
          }
        }
        return ret;
      },findObject:function (path, dontResolveLastLink) {
        FS.ensureRoot();
        var ret = FS.analyzePath(path, dontResolveLastLink);
        if (ret.exists) {
          return ret.object;
        } else {
          ___setErrNo(ret.error);
          return null;
        }
      },createObject:function (parent, name, properties, canRead, canWrite) {
        if (!parent) parent = '/';
        if (typeof parent === 'string') parent = FS.findObject(parent);
        if (!parent) {
          ___setErrNo(ERRNO_CODES.EACCES);
          throw new Error('Parent path must exist.');
        }
        if (!parent.isFolder) {
          ___setErrNo(ERRNO_CODES.ENOTDIR);
          throw new Error('Parent must be a folder.');
        }
        if (!parent.write && !FS.ignorePermissions) {
          ___setErrNo(ERRNO_CODES.EACCES);
          throw new Error('Parent folder must be writeable.');
        }
        if (!name || name == '.' || name == '..') {
          ___setErrNo(ERRNO_CODES.ENOENT);
          throw new Error('Name must not be empty.');
        }
        if (parent.contents.hasOwnProperty(name)) {
          ___setErrNo(ERRNO_CODES.EEXIST);
          throw new Error("Can't overwrite object.");
        }
        parent.contents[name] = {
          read: canRead === undefined ? true : canRead,
          write: canWrite === undefined ? false : canWrite,
          timestamp: Date.now(),
          inodeNumber: FS.nextInode++
        };
        for (var key in properties) {
          if (properties.hasOwnProperty(key)) {
            parent.contents[name][key] = properties[key];
          }
        }
        return parent.contents[name];
      },createFolder:function (parent, name, canRead, canWrite) {
        var properties = {isFolder: true, isDevice: false, contents: {}};
        return FS.createObject(parent, name, properties, canRead, canWrite);
      },createPath:function (parent, path, canRead, canWrite) {
        var current = FS.findObject(parent);
        if (current === null) throw new Error('Invalid parent.');
        path = path.split('/').reverse();
        while (path.length) {
          var part = path.pop();
          if (!part) continue;
          if (!current.contents.hasOwnProperty(part)) {
            FS.createFolder(current, part, canRead, canWrite);
          }
          current = current.contents[part];
        }
        return current;
      },createFile:function (parent, name, properties, canRead, canWrite) {
        properties.isFolder = false;
        return FS.createObject(parent, name, properties, canRead, canWrite);
      },createDataFile:function (parent, name, data, canRead, canWrite) {
        if (typeof data === 'string') {
          var dataArray = new Array(data.length);
          for (var i = 0, len = data.length; i < len; ++i) dataArray[i] = data.charCodeAt(i);
          data = dataArray;
        }
        var properties = {
          isDevice: false,
          contents: data.subarray ? data.subarray(0) : data // as an optimization, create a new array wrapper (not buffer) here, to help JS engines understand this object
        };
        return FS.createFile(parent, name, properties, canRead, canWrite);
      },createLazyFile:function (parent, name, url, canRead, canWrite) {
        if (typeof XMLHttpRequest !== 'undefined') {
          if (!ENVIRONMENT_IS_WORKER) throw 'Cannot do synchronous binary XHRs outside webworkers in modern browsers. Use --embed-file or --preload-file in emcc';
          // Lazy chunked Uint8Array (implements get and length from Uint8Array). Actual getting is abstracted away for eventual reuse.
          var LazyUint8Array = function(chunkSize, length) {
            this.length = length;
            this.chunkSize = chunkSize;
            this.chunks = []; // Loaded chunks. Index is the chunk number
          }
          LazyUint8Array.prototype.get = function(idx) {
            if (idx > this.length-1 || idx < 0) {
              return undefined;
            }
            var chunkOffset = idx % chunkSize;
            var chunkNum = Math.floor(idx / chunkSize);
            return this.getter(chunkNum)[chunkOffset];
          }
          LazyUint8Array.prototype.setDataGetter = function(getter) {
            this.getter = getter;
          }
          // Find length
          var xhr = new XMLHttpRequest();
          xhr.open('HEAD', url, false);
          xhr.send(null);
          if (!(xhr.status >= 200 && xhr.status < 300 || xhr.status === 304)) throw new Error("Couldn't load " + url + ". Status: " + xhr.status);
          var datalength = Number(xhr.getResponseHeader("Content-length"));
          var header;
          var hasByteServing = (header = xhr.getResponseHeader("Accept-Ranges")) && header === "bytes";
          var chunkSize = 1024*1024; // Chunk size in bytes
          if (!hasByteServing) chunkSize = datalength;
          // Function to get a range from the remote URL.
          var doXHR = (function(from, to) {
            if (from > to) throw new Error("invalid range (" + from + ", " + to + ") or no bytes requested!");
            if (to > datalength-1) throw new Error("only " + datalength + " bytes available! programmer error!");
            // TODO: Use mozResponseArrayBuffer, responseStream, etc. if available.
            var xhr = new XMLHttpRequest();
            xhr.open('GET', url, false);
            if (datalength !== chunkSize) xhr.setRequestHeader("Range", "bytes=" + from + "-" + to);
            // Some hints to the browser that we want binary data.
            if (typeof Uint8Array != 'undefined') xhr.responseType = 'arraybuffer';
            if (xhr.overrideMimeType) {
              xhr.overrideMimeType('text/plain; charset=x-user-defined');
            }
            xhr.send(null);
            if (!(xhr.status >= 200 && xhr.status < 300 || xhr.status === 304)) throw new Error("Couldn't load " + url + ". Status: " + xhr.status);
            if (xhr.response !== undefined) {
              return new Uint8Array(xhr.response || []);
            } else {
              return intArrayFromString(xhr.responseText || '', true);
            }
          });
          var lazyArray = new LazyUint8Array(chunkSize, datalength);
          lazyArray.setDataGetter(function(chunkNum) {
            var start = chunkNum * lazyArray.chunkSize;
            var end = (chunkNum+1) * lazyArray.chunkSize - 1; // including this byte
            end = Math.min(end, datalength-1); // if datalength-1 is selected, this is the last block
            if (typeof(lazyArray.chunks[chunkNum]) === "undefined") {
              lazyArray.chunks[chunkNum] = doXHR(start, end);
            }
            if (typeof(lazyArray.chunks[chunkNum]) === "undefined") throw new Error("doXHR failed!");
            return lazyArray.chunks[chunkNum];
          });
          var properties = { isDevice: false, contents: lazyArray };
        } else {
          var properties = { isDevice: false, url: url };
        }
        return FS.createFile(parent, name, properties, canRead, canWrite);
      },createPreloadedFile:function (parent, name, url, canRead, canWrite, onload, onerror, dontCreateFile) {
        Browser.init();
        var fullname = FS.joinPath([parent, name], true);
        function processData(byteArray) {
          function finish(byteArray) {
            if (!dontCreateFile) {
              FS.createDataFile(parent, name, byteArray, canRead, canWrite);
            }
            if (onload) onload();
            removeRunDependency('cp ' + fullname);
          }
          var handled = false;
          Module['preloadPlugins'].forEach(function(plugin) {
            if (handled) return;
            if (plugin['canHandle'](fullname)) {
              plugin['handle'](byteArray, fullname, finish, function() {
                if (onerror) onerror();
                removeRunDependency('cp ' + fullname);
              });
              handled = true;
            }
          });
          if (!handled) finish(byteArray);
        }
        addRunDependency('cp ' + fullname);
        if (typeof url == 'string') {
          Browser.asyncLoad(url, function(byteArray) {
            processData(byteArray);
          }, onerror);
        } else {
          processData(url);
        }
      },createLink:function (parent, name, target, canRead, canWrite) {
        var properties = {isDevice: false, link: target};
        return FS.createFile(parent, name, properties, canRead, canWrite);
      },createDevice:function (parent, name, input, output) {
        if (!(input || output)) {
          throw new Error('A device must have at least one callback defined.');
        }
        var ops = {isDevice: true, input: input, output: output};
        return FS.createFile(parent, name, ops, Boolean(input), Boolean(output));
      },forceLoadFile:function (obj) {
        if (obj.isDevice || obj.isFolder || obj.link || obj.contents) return true;
        var success = true;
        if (typeof XMLHttpRequest !== 'undefined') {
          throw new Error("Lazy loading should have been performed (contents set) in createLazyFile, but it was not. Lazy loading only works in web workers. Use --embed-file or --preload-file in emcc on the main thread.");
        } else if (Module['read']) {
          // Command-line.
          try {
            // WARNING: Can't read binary files in V8's d8 or tracemonkey's js, as
            //          read() will try to parse UTF8.
            obj.contents = intArrayFromString(Module['read'](obj.url), true);
          } catch (e) {
            success = false;
          }
        } else {
          throw new Error('Cannot load without read() or XMLHttpRequest.');
        }
        if (!success) ___setErrNo(ERRNO_CODES.EIO);
        return success;
      },ensureRoot:function () {
        if (FS.root) return;
        // The main file system tree. All the contents are inside this.
        FS.root = {
          read: true,
          write: true,
          isFolder: true,
          isDevice: false,
          timestamp: Date.now(),
          inodeNumber: 1,
          contents: {}
        };
      },init:function (input, output, error) {
        // Make sure we initialize only once.
        assert(!FS.init.initialized, 'FS.init was previously called. If you want to initialize later with custom parameters, remove any earlier calls (note that one is automatically added to the generated code)');
        FS.init.initialized = true;
        FS.ensureRoot();
        // Allow Module.stdin etc. to provide defaults, if none explicitly passed to us here
        input = input || Module['stdin'];
        output = output || Module['stdout'];
        error = error || Module['stderr'];
        // Default handlers.
        var stdinOverridden = true, stdoutOverridden = true, stderrOverridden = true;
        if (!input) {
          stdinOverridden = false;
          input = function() {
            if (!input.cache || !input.cache.length) {
              var result;
              if (typeof window != 'undefined' &&
                  typeof window.prompt == 'function') {
                // Browser.
                result = window.prompt('Input: ');
                if (result === null) result = String.fromCharCode(0); // cancel ==> EOF
              } else if (typeof readline == 'function') {
                // Command line.
                result = readline();
              }
              if (!result) result = '';
              input.cache = intArrayFromString(result + '\n', true);
            }
            return input.cache.shift();
          };
        }
        var utf8 = new Runtime.UTF8Processor();
        function simpleOutput(val) {
          if (val === null || val === 10) {
            output.printer(output.buffer.join(''));
            output.buffer = [];
          } else {
            output.buffer.push(utf8.processCChar(val));
          }
        }
        if (!output) {
          stdoutOverridden = false;
          output = simpleOutput;
        }
        if (!output.printer) output.printer = Module['print'];
        if (!output.buffer) output.buffer = [];
        if (!error) {
          stderrOverridden = false;
          error = simpleOutput;
        }
        if (!error.printer) error.printer = Module['print'];
        if (!error.buffer) error.buffer = [];
        // Create the temporary folder, if not already created
        try {
          FS.createFolder('/', 'tmp', true, true);
        } catch(e) {}
        // Create the I/O devices.
        var devFolder = FS.createFolder('/', 'dev', true, true);
        var stdin = FS.createDevice(devFolder, 'stdin', input);
        var stdout = FS.createDevice(devFolder, 'stdout', null, output);
        var stderr = FS.createDevice(devFolder, 'stderr', null, error);
        FS.createDevice(devFolder, 'tty', input, output);
        // Create default streams.
        FS.streams[1] = {
          path: '/dev/stdin',
          object: stdin,
          position: 0,
          isRead: true,
          isWrite: false,
          isAppend: false,
          isTerminal: !stdinOverridden,
          error: false,
          eof: false,
          ungotten: []
        };
        FS.streams[2] = {
          path: '/dev/stdout',
          object: stdout,
          position: 0,
          isRead: false,
          isWrite: true,
          isAppend: false,
          isTerminal: !stdoutOverridden,
          error: false,
          eof: false,
          ungotten: []
        };
        FS.streams[3] = {
          path: '/dev/stderr',
          object: stderr,
          position: 0,
          isRead: false,
          isWrite: true,
          isAppend: false,
          isTerminal: !stderrOverridden,
          error: false,
          eof: false,
          ungotten: []
        };
        assert(Math.max(_stdin, _stdout, _stderr) < 128); // make sure these are low, we flatten arrays with these
        HEAP32[((_stdin)>>2)]=1;
        HEAP32[((_stdout)>>2)]=2;
        HEAP32[((_stderr)>>2)]=3;
        // Other system paths
        FS.createPath('/', 'dev/shm/tmp', true, true); // temp files
        // Newlib initialization
        for (var i = FS.streams.length; i < Math.max(_stdin, _stdout, _stderr) + 4; i++) {
          FS.streams[i] = null; // Make sure to keep FS.streams dense
        }
        FS.streams[_stdin] = FS.streams[1];
        FS.streams[_stdout] = FS.streams[2];
        FS.streams[_stderr] = FS.streams[3];
        allocate([ allocate(
          [0, 0, 0, 0, _stdin, 0, 0, 0, _stdout, 0, 0, 0, _stderr, 0, 0, 0],
          'void*', ALLOC_STATIC) ], 'void*', ALLOC_NONE, __impure_ptr);
      },quit:function () {
        if (!FS.init.initialized) return;
        // Flush any partially-printed lines in stdout and stderr. Careful, they may have been closed
        if (FS.streams[2] && FS.streams[2].object.output.buffer.length > 0) FS.streams[2].object.output(10);
        if (FS.streams[3] && FS.streams[3].object.output.buffer.length > 0) FS.streams[3].object.output(10);
      },standardizePath:function (path) {
        if (path.substr(0, 2) == './') path = path.substr(2);
        return path;
      },deleteFile:function (path) {
        path = FS.analyzePath(path);
        if (!path.parentExists || !path.exists) {
          throw 'Invalid path ' + path;
        }
        delete path.parentObject.contents[path.name];
      }};
  function _pwrite(fildes, buf, nbyte, offset) {
      // ssize_t pwrite(int fildes, const void *buf, size_t nbyte, off_t offset);
      // http://pubs.opengroup.org/onlinepubs/000095399/functions/write.html
      var stream = FS.streams[fildes];
      if (!stream || stream.object.isDevice) {
        ___setErrNo(ERRNO_CODES.EBADF);
        return -1;
      } else if (!stream.isWrite) {
        ___setErrNo(ERRNO_CODES.EACCES);
        return -1;
      } else if (stream.object.isFolder) {
        ___setErrNo(ERRNO_CODES.EISDIR);
        return -1;
      } else if (nbyte < 0 || offset < 0) {
        ___setErrNo(ERRNO_CODES.EINVAL);
        return -1;
      } else {
        var contents = stream.object.contents;
        while (contents.length < offset) contents.push(0);
        for (var i = 0; i < nbyte; i++) {
          contents[offset + i] = HEAPU8[(((buf)+(i))|0)];
        }
        stream.object.timestamp = Date.now();
        return i;
      }
    }function _write(fildes, buf, nbyte) {
      // ssize_t write(int fildes, const void *buf, size_t nbyte);
      // http://pubs.opengroup.org/onlinepubs/000095399/functions/write.html
      var stream = FS.streams[fildes];
      if (!stream) {
        ___setErrNo(ERRNO_CODES.EBADF);
        return -1;
      } else if (!stream.isWrite) {
        ___setErrNo(ERRNO_CODES.EACCES);
        return -1;
      } else if (nbyte < 0) {
        ___setErrNo(ERRNO_CODES.EINVAL);
        return -1;
      } else {
        if (stream.object.isDevice) {
          if (stream.object.output) {
            for (var i = 0; i < nbyte; i++) {
              try {
                stream.object.output(HEAP8[(((buf)+(i))|0)]);
              } catch (e) {
                ___setErrNo(ERRNO_CODES.EIO);
                return -1;
              }
            }
            stream.object.timestamp = Date.now();
            return i;
          } else {
            ___setErrNo(ERRNO_CODES.ENXIO);
            return -1;
          }
        } else {
          var bytesWritten = _pwrite(fildes, buf, nbyte, stream.position);
          if (bytesWritten != -1) stream.position += bytesWritten;
          return bytesWritten;
        }
      }
    }
  function _strlen(ptr) {
      ptr = ptr|0;
      var curr = 0;
      curr = ptr;
      while (HEAP8[(curr)]|0 != 0) {
        curr = (curr + 1)|0;
      }
      return (curr - ptr)|0;
    }function _fputs(s, stream) {
      // int fputs(const char *restrict s, FILE *restrict stream);
      // http://pubs.opengroup.org/onlinepubs/000095399/functions/fputs.html
      return _write(stream, s, _strlen(s));
    }
  function _fputc(c, stream) {
      // int fputc(int c, FILE *stream);
      // http://pubs.opengroup.org/onlinepubs/000095399/functions/fputc.html
      var chr = unSign(c & 0xFF);
      HEAP8[((_fputc.ret)|0)]=chr
      var ret = _write(stream, _fputc.ret, 1);
      if (ret == -1) {
        if (FS.streams[stream]) FS.streams[stream].error = true;
        return -1;
      } else {
        return chr;
      }
    }function _puts(s) {
      // int puts(const char *s);
      // http://pubs.opengroup.org/onlinepubs/000095399/functions/puts.html
      // NOTE: puts() always writes an extra newline.
      var stdout = HEAP32[((_stdout)>>2)];
      var ret = _fputs(s, stdout);
      if (ret < 0) {
        return ret;
      } else {
        var newlineRet = _fputc(10, stdout);
        return (newlineRet < 0) ? -1 : ret + 1;
      }
    }
  var ERRNO_MESSAGES={1:"Operation not permitted",2:"No such file or directory",3:"No such process",4:"Interrupted system call",5:"Input/output error",6:"No such device or address",8:"Exec format error",9:"Bad file descriptor",10:"No child processes",11:"Resource temporarily unavailable",12:"Cannot allocate memory",13:"Permission denied",14:"Bad address",16:"Device or resource busy",17:"File exists",18:"Invalid cross-device link",19:"No such device",20:"Not a directory",21:"Is a directory",22:"Invalid argument",23:"Too many open files in system",24:"Too many open files",25:"Inappropriate ioctl for device",26:"Text file busy",27:"File too large",28:"No space left on device",29:"Illegal seek",30:"Read-only file system",31:"Too many links",32:"Broken pipe",33:"Numerical argument out of domain",34:"Numerical result out of range",35:"Resource deadlock avoided",36:"File name too long",37:"No locks available",38:"Function not implemented",39:"Directory not empty",40:"Too many levels of symbolic links",42:"No message of desired type",43:"Identifier removed",60:"Device not a stream",61:"No data available",62:"Timer expired",63:"Out of streams resources",67:"Link has been severed",71:"Protocol error",72:"Multihop attempted",74:"Bad message",75:"Value too large for defined data type",84:"Invalid or incomplete multibyte or wide character",88:"Socket operation on non-socket",89:"Destination address required",90:"Message too long",91:"Protocol wrong type for socket",92:"Protocol not available",93:"Protocol not supported",95:"Operation not supported",97:"Address family not supported by protocol",98:"Address already in use",99:"Cannot assign requested address",100:"Network is down",101:"Network is unreachable",102:"Network dropped connection on reset",103:"Software caused connection abort",104:"Connection reset by peer",105:"No buffer space available",106:"Transport endpoint is already connected",107:"Transport endpoint is not connected",110:"Connection timed out",111:"Connection refused",113:"No route to host",114:"Operation already in progress",115:"Operation now in progress",116:"Stale NFS file handle",122:"Disk quota exceeded",125:"Operation canceled",130:"Owner died",131:"State not recoverable"};function _strerror_r(errnum, strerrbuf, buflen) {
      if (errnum in ERRNO_MESSAGES) {
        if (ERRNO_MESSAGES[errnum].length > buflen - 1) {
          return ___setErrNo(ERRNO_CODES.ERANGE);
        } else {
          var msg = ERRNO_MESSAGES[errnum];
          for (var i = 0; i < msg.length; i++) {
            HEAP8[(((strerrbuf)+(i))|0)]=msg.charCodeAt(i)
          }
          HEAP8[(((strerrbuf)+(i))|0)]=0
          return 0;
        }
      } else {
        return ___setErrNo(ERRNO_CODES.EINVAL);
      }
    }function _strerror(errnum) {
      if (!_strerror.buffer) _strerror.buffer = _malloc(256);
      _strerror_r(errnum, _strerror.buffer, 256);
      return _strerror.buffer;
    }
  function ___errno_location() {
      return ___setErrNo.ret;
    }function _perror(s) {
      // void perror(const char *s);
      // http://pubs.opengroup.org/onlinepubs/000095399/functions/perror.html
      var stdout = HEAP32[((_stdout)>>2)];
      if (s) {
        _fputs(s, stdout);
        _fputc(58, stdout);
        _fputc(32, stdout);
      }
      var errnum = HEAP32[((___errno_location())>>2)];
      _puts(_strerror(errnum));
    }
  function _gettimeofday(ptr) {
      // %struct.timeval = type { i32, i32 }
      var now = Date.now();
      HEAP32[((ptr)>>2)]=Math.floor(now/1000); // seconds
      HEAP32[(((ptr)+(4))>>2)]=Math.floor((now-1000*Math.floor(now/1000))*1000); // microseconds
      return 0;
    }
  var ___hostent_struct_layout={__size__:20,h_name:0,h_aliases:4,h_addrtype:8,h_length:12,h_addr_list:16};function _gethostbyname(name) {
      name = Pointer_stringify(name);
        if (!_gethostbyname.id) {
          _gethostbyname.id = 1;
          _gethostbyname.table = {};
        }
      var id = _gethostbyname.id++;
      assert(id < 65535);
      var fakeAddr = 172 | (29 << 8) | ((id & 0xff) << 16) | ((id & 0xff00) << 24);
      _gethostbyname.table[id] = name;
      // generate hostent
      var ret = _malloc(___hostent_struct_layout.__size__);
      var nameBuf = _malloc(name.length+1);
      writeStringToMemory(name, nameBuf);
      setValue(ret+___hostent_struct_layout.h_name, nameBuf, 'i8*');
      var aliasesBuf = _malloc(4);
      setValue(aliasesBuf, 0, 'i8*');
      setValue(ret+___hostent_struct_layout.h_aliases, aliasesBuf, 'i8**');
      setValue(ret+___hostent_struct_layout.h_addrtype, 1, 'i32');
      setValue(ret+___hostent_struct_layout.h_length, 4, 'i32');
      var addrListBuf = _malloc(12);
      setValue(addrListBuf, addrListBuf+8, 'i32*');
      setValue(addrListBuf+4, 0, 'i32*');
      setValue(addrListBuf+8, fakeAddr, 'i32');
      setValue(ret+___hostent_struct_layout.h_addr_list, addrListBuf, 'i8**');
      return ret;
    }
  function _inet_addr(ptr) {
      var b = Pointer_stringify(ptr).split(".");
      if (b.length !== 4) return -1; // we return -1 for error, and otherwise a uint32. this helps inet_pton differentiate
      return (Number(b[0]) | (Number(b[1]) << 8) | (Number(b[2]) << 16) | (Number(b[3]) << 24)) >>> 0;
    }function _inet_aton(cp, inp) {
      var addr = _inet_addr(cp);
      setValue(inp, addr, 'i32');
      if (addr < 0) return 0;
      return 1;
    }
  function __inet_ntop_raw(addr) {
      return (addr & 0xff) + '.' + ((addr >> 8) & 0xff) + '.' + ((addr >> 16) & 0xff) + '.' + ((addr >> 24) & 0xff)
    }function _inet_ntop(af, src, dst, size) {
      var addr = getValue(src, 'i32');
      var str = __inet_ntop_raw(addr);
      writeStringToMemory(str.substr(0, size), dst);
      return dst;
    }function _inet_ntoa(in_addr) {
      if (!_inet_ntoa.buffer) {
        _inet_ntoa.buffer = _malloc(1024);
      }
      return _inet_ntop(0, in_addr, _inet_ntoa.buffer, 1024);
    }
  function _strncpy(pdest, psrc, num) {
      pdest = pdest|0; psrc = psrc|0; num = num|0;
      var padding = 0, curr = 0, i = 0;
      while ((i|0) < (num|0)) {
        curr = padding ? 0 : HEAP8[(((psrc)+(i))|0)];
        HEAP8[(((pdest)+(i))|0)]=curr
        padding = padding ? 1 : (HEAP8[(((psrc)+(i))|0)] == 0);
        i = (i+1)|0;
      }
      return pdest|0;
    }
var _gethostbyaddr; // stub for _gethostbyaddr
  var Sockets={BACKEND_WEBSOCKETS:0,BACKEND_WEBRTC:1,BUFFER_SIZE:10240,MAX_BUFFER_SIZE:10485760,backend:0,nextFd:1,fds:{},sockaddr_in_layout:{__size__:20,sin_family:0,sin_port:4,sin_addr:8,sin_zero:12,sin_zero_b:16},msghdr_layout:{__size__:28,msg_name:0,msg_namelen:4,msg_iov:8,msg_iovlen:12,msg_control:16,msg_controllen:20,msg_flags:24},backends:{0:{connect:function (info) {
            console.log('opening ws://' + info.host + ':' + info.port);
            info.socket = new WebSocket('ws://' + info.host + ':' + info.port, ['binary']);
            info.socket.binaryType = 'arraybuffer';
            var i32Temp = new Uint32Array(1);
            var i8Temp = new Uint8Array(i32Temp.buffer);
            info.inQueue = [];
            info.hasData = function() { return info.inQueue.length > 0 }
            if (!info.stream) {
              var partialBuffer = null; // in datagram mode, inQueue contains full dgram messages; this buffers incomplete data. Must begin with the beginning of a message
            }
            info.socket.onmessage = function(event) {
              assert(typeof event.data !== 'string' && event.data.byteLength); // must get binary data!
              var data = new Uint8Array(event.data); // make a typed array view on the array buffer
              if (info.stream) {
                info.inQueue.push(data);
              } else {
                // we added headers with message sizes, read those to find discrete messages
                if (partialBuffer) {
                  // append to the partial buffer
                  var newBuffer = new Uint8Array(partialBuffer.length + data.length);
                  newBuffer.set(partialBuffer);
                  newBuffer.set(data, partialBuffer.length);
                  // forget the partial buffer and work on data
                  data = newBuffer;
                  partialBuffer = null;
                }
                var currPos = 0;
                while (currPos+4 < data.length) {
                  i8Temp.set(data.subarray(currPos, currPos+4));
                  var currLen = i32Temp[0];
                  assert(currLen > 0);
                  if (currPos + 4 + currLen > data.length) {
                    break; // not enough data has arrived
                  }
                  currPos += 4;
                  info.inQueue.push(data.subarray(currPos, currPos+currLen));
                  currPos += currLen;
                }
                // If data remains, buffer it
                if (currPos < data.length) {
                  partialBuffer = data.subarray(currPos);
                }
              }
            }
            function send(data) {
              // TODO: if browser accepts views, can optimize this
              // ok to use the underlying buffer, we created data and know that the buffer starts at the beginning
              info.socket.send(data.buffer);
            }
            var outQueue = [];
            var intervalling = false, interval;
            function trySend() {
              if (info.socket.readyState != info.socket.OPEN) {
                if (!intervalling) {
                  intervalling = true;
                  console.log('waiting for socket in order to send');
                  interval = setInterval(trySend, 100);
                }
                return;
              }
              for (var i = 0; i < outQueue.length; i++) {
                send(outQueue[i]);
              }
              outQueue.length = 0;
              if (intervalling) {
                intervalling = false;
                clearInterval(interval);
              }
            }
            info.sender = function(data) {
              if (!info.stream) {
                // add a header with the message size
                var header = new Uint8Array(4);
                i32Temp[0] = data.length;
                header.set(i8Temp);
                outQueue.push(header);
              }
              outQueue.push(new Uint8Array(data));
              trySend();
            };
          }},1:{}}};function _connect(fd, addr, addrlen) {
      var info = Sockets.fds[fd];
      if (!info) return -1;
      info.connected = true;
      info.addr = getValue(addr + Sockets.sockaddr_in_layout.sin_addr, 'i32');
      info.port = _htons(getValue(addr + Sockets.sockaddr_in_layout.sin_port, 'i16'));
      info.host = __inet_ntop_raw(info.addr);
      // Support 'fake' ips from gethostbyname
      var parts = info.host.split('.');
      if (parts[0] == '172' && parts[1] == '29') {
        var low = Number(parts[2]);
        var high = Number(parts[3]);
        info.host = _gethostbyname.table[low + 0xff*high];
        assert(info.host, 'problem translating fake ip ' + parts);
      }
      Sockets.backends[Sockets.backend].connect(info);
      return 0;
    }function _bind(fd, addr, addrlen) {
      return _connect(fd, addr, addrlen);
    }
  function _listen(fd, backlog) {
      return 0;
    }
  function _socket(family, type, protocol) {
      var fd = Sockets.nextFd++;
      assert(fd < 64); // select() assumes socket fd values are in 0..63
      var stream = type == 200;
      if (protocol) {
        assert(stream == (protocol == 1)); // if stream, must be tcp
      }
      if (Sockets.backend == Sockets.BACKEND_WEBRTC) {
        assert(!stream); // If WebRTC, we can only support datagram, not stream
      }
      Sockets.fds[fd] = {
        connected: false,
        stream: stream
      };
      return fd;
    }
  function _setsockopt(d, level, optname, optval, optlen) {
      console.log('ignoring setsockopt command');
      return 0;
    }
  var ___errno=___errno_location;
  function _accept(fd, addr, addrlen) {
      // TODO: webrtc queued incoming connections, etc.
      // For now, the model is that bind does a connect, and we "accept" that one connection,
      // which has host:port the same as ours. We also return the same socket fd.
      var info = Sockets.fds[fd];
      if (!info) return -1;
      if (addr) {
        setValue(addr + Sockets.sockaddr_in_layout.sin_addr, info.addr, 'i32');
        setValue(addr + Sockets.sockaddr_in_layout.sin_port, info.port, 'i32');
        setValue(addrlen, Sockets.sockaddr_in_layout.__size__, 'i32');
      }
      return fd;
    }
  function _shutdown(fd, how) {
      var info = Sockets.fds[fd];
      if (!info) return -1;
      info.socket.close();
      Sockets.fds[fd] = null;
    }
  function _close(fildes) {
      // int close(int fildes);
      // http://pubs.opengroup.org/onlinepubs/000095399/functions/close.html
      if (FS.streams[fildes]) {
        if (FS.streams[fildes].currentEntry) {
          _free(FS.streams[fildes].currentEntry);
        }
        FS.streams[fildes] = null;
        return 0;
      } else {
        ___setErrNo(ERRNO_CODES.EBADF);
        return -1;
      }
    }
  function _sendmsg(fd, msg, flags) {
      var info = Sockets.fds[fd];
      if (!info) return -1;
      // if we are not connected, use the address info in the message
      if (!info.connected) {
        var name = HEAP32[(((msg)+(Sockets.msghdr_layout.msg_name))>>2)];
        assert(name, 'sendmsg on non-connected socket, and no name/address in the message');
        _connect(fd, name, HEAP32[(((msg)+(Sockets.msghdr_layout.msg_namelen))>>2)]);
      }
      var iov = HEAP32[(((msg)+(Sockets.msghdr_layout.msg_iov))>>2)];
      var num = HEAP32[(((msg)+(Sockets.msghdr_layout.msg_iovlen))>>2)];
      var totalSize = 0;
      for (var i = 0; i < num; i++) {
        totalSize += HEAP32[(((iov)+(8*i + 4))>>2)];
      }
      var buffer = new Uint8Array(totalSize);
      var ret = 0;
      for (var i = 0; i < num; i++) {
        var currNum = HEAP32[(((iov)+(8*i + 4))>>2)];
        if (!currNum) continue;
        var currBuf = HEAP32[(((iov)+(8*i))>>2)];
        buffer.set(HEAPU8.subarray(currBuf, currBuf+currNum), ret);
        ret += currNum;
      }
      info.sender(buffer); // send all the iovs as a single message
      return ret;
    }
  function _recv(fd, buf, len, flags) {
      var info = Sockets.fds[fd];
      if (!info) return -1;
      if (!info.hasData()) {
        ___setErrNo(ERRNO_CODES.EAGAIN); // no data, and all sockets are nonblocking, so this is the right behavior
        return -1;
      }
      var buffer = info.inQueue.shift();
      if (len < buffer.length) {
        if (info.stream) {
          // This is tcp (reliable), so if not all was read, keep it
          info.inQueue.unshift(buffer.subarray(len));
        }
        buffer = buffer.subarray(0, len);
      }
      HEAPU8.set(buffer, buf);
      return buffer.length;
    }function _recvmsg(fd, msg, flags) {
      var info = Sockets.fds[fd];
      if (!info) return -1;
      // if we are not connected, use the address info in the message
      if (!info.connected) {
        var name = HEAP32[(((msg)+(Sockets.msghdr_layout.msg_name))>>2)];
        assert(name, 'sendmsg on non-connected socket, and no name/address in the message');
        _connect(fd, name, HEAP32[(((msg)+(Sockets.msghdr_layout.msg_namelen))>>2)]);
      }
      if (!info.hasData()) {
        ___setErrNo(ERRNO_CODES.EWOULDBLOCK);
        return -1;
      }
      var buffer = info.inQueue.shift();
      var bytes = buffer.length;
      // write source
      var name = HEAP32[(((msg)+(Sockets.msghdr_layout.msg_name))>>2)];
      HEAP32[(((name)+(Sockets.sockaddr_in_layout.sin_addr))>>2)]=info.addr;
      HEAP16[(((name)+(Sockets.sockaddr_in_layout.sin_port))>>1)]=_htons(info.port);
      // write data
      var ret = bytes;
      var iov = HEAP32[(((msg)+(Sockets.msghdr_layout.msg_iov))>>2)];
      var num = HEAP32[(((msg)+(Sockets.msghdr_layout.msg_iovlen))>>2)];
      var bufferPos = 0;
      for (var i = 0; i < num && bytes > 0; i++) {
        var currNum = HEAP32[(((iov)+(8*i + 4))>>2)];
        if (!currNum) continue;
        currNum = Math.min(currNum, bytes); // XXX what should happen when we partially fill a buffer..?
        bytes -= currNum;
        var currBuf = HEAP32[(((iov)+(8*i))>>2)];
        HEAPU8.set(buffer.subarray(bufferPos, bufferPos + currNum), currBuf);
        bufferPos += currNum;
      }
      if (info.stream) {
        // This is tcp (reliable), so if not all was read, keep it
        if (bufferPos < bytes) {
          info.inQueue.unshift(buffer.subarray(bufferPos));
        }
      }
      return ret;
    }
  function _select(nfds, readfds, writefds, exceptfds, timeout) {
      // readfds are supported,
      // writefds checks socket open status
      // exceptfds not supported
      // timeout is always 0 - fully async
      assert(!exceptfds);
      function canRead(info) {
        // make sure hasData exists. 
        // we do create it when the socket is connected, 
        // but other implementations may create it lazily
        return info.hasData && info.hasData();
      }
      function canWrite(info) {
        // make sure socket exists. 
        // we do create it when the socket is connected, 
        // but other implementations may create it lazily
        return info.socket && (info.socket.readyState == info.socket.OPEN);
      }
      function checkfds(nfds, fds, can) {
        if (!fds) return 0;
        var bitsSet = 0;
        var dstLow  = 0;
        var dstHigh = 0;
        var srcLow  = HEAP32[((fds)>>2)];
        var srcHigh = HEAP32[(((fds)+(4))>>2)];
        nfds = Math.min(64, nfds); // fd sets have 64 bits
        for (var fd = 0; fd < nfds; fd++) {
          var mask = 1 << (fd % 32), int = fd < 32 ? srcLow : srcHigh;
          if (int & mask) {
            // index is in the set, check if it is ready for read
            var info = Sockets.fds[fd];
            if (info && can(info)) {
              // set bit
              fd < 32 ? (dstLow = dstLow | mask) : (dstHigh = dstHigh | mask);
              bitsSet++;
            }
          }
        }
        HEAP32[((fds)>>2)]=dstLow;
        HEAP32[(((fds)+(4))>>2)]=dstHigh;
        return bitsSet;
      }
      return checkfds(nfds, readfds, canRead)
           + checkfds(nfds, writefds, canWrite);
    }
  function _fwrite(ptr, size, nitems, stream) {
      // size_t fwrite(const void *restrict ptr, size_t size, size_t nitems, FILE *restrict stream);
      // http://pubs.opengroup.org/onlinepubs/000095399/functions/fwrite.html
      var bytesToWrite = nitems * size;
      if (bytesToWrite == 0) return 0;
      var bytesWritten = _write(stream, ptr, bytesToWrite);
      if (bytesWritten == -1) {
        if (FS.streams[stream]) FS.streams[stream].error = true;
        return 0;
      } else {
        return Math.floor(bytesWritten / size);
      }
    }
  function __reallyNegative(x) {
      return x < 0 || (x === 0 && (1/x) === -Infinity);
    }function __formatString(format, varargs) {
      var textIndex = format;
      var argIndex = 0;
      function getNextArg(type) {
        // NOTE: Explicitly ignoring type safety. Otherwise this fails:
        //       int x = 4; printf("%c\n", (char)x);
        var ret;
        if (type === 'double') {
          ret = (HEAP32[((tempDoublePtr)>>2)]=HEAP32[(((varargs)+(argIndex))>>2)],HEAP32[(((tempDoublePtr)+(4))>>2)]=HEAP32[(((varargs)+((argIndex)+(4)))>>2)],HEAPF64[(tempDoublePtr)>>3]);
        } else if (type == 'i64') {
          ret = [HEAP32[(((varargs)+(argIndex))>>2)],
                 HEAP32[(((varargs)+(argIndex+4))>>2)]];
        } else {
          type = 'i32'; // varargs are always i32, i64, or double
          ret = HEAP32[(((varargs)+(argIndex))>>2)];
        }
        argIndex += Runtime.getNativeFieldSize(type);
        return ret;
      }
      var ret = [];
      var curr, next, currArg;
      while(1) {
        var startTextIndex = textIndex;
        curr = HEAP8[(textIndex)];
        if (curr === 0) break;
        next = HEAP8[((textIndex+1)|0)];
        if (curr == 37) {
          // Handle flags.
          var flagAlwaysSigned = false;
          var flagLeftAlign = false;
          var flagAlternative = false;
          var flagZeroPad = false;
          flagsLoop: while (1) {
            switch (next) {
              case 43:
                flagAlwaysSigned = true;
                break;
              case 45:
                flagLeftAlign = true;
                break;
              case 35:
                flagAlternative = true;
                break;
              case 48:
                if (flagZeroPad) {
                  break flagsLoop;
                } else {
                  flagZeroPad = true;
                  break;
                }
              default:
                break flagsLoop;
            }
            textIndex++;
            next = HEAP8[((textIndex+1)|0)];
          }
          // Handle width.
          var width = 0;
          if (next == 42) {
            width = getNextArg('i32');
            textIndex++;
            next = HEAP8[((textIndex+1)|0)];
          } else {
            while (next >= 48 && next <= 57) {
              width = width * 10 + (next - 48);
              textIndex++;
              next = HEAP8[((textIndex+1)|0)];
            }
          }
          // Handle precision.
          var precisionSet = false;
          if (next == 46) {
            var precision = 0;
            precisionSet = true;
            textIndex++;
            next = HEAP8[((textIndex+1)|0)];
            if (next == 42) {
              precision = getNextArg('i32');
              textIndex++;
            } else {
              while(1) {
                var precisionChr = HEAP8[((textIndex+1)|0)];
                if (precisionChr < 48 ||
                    precisionChr > 57) break;
                precision = precision * 10 + (precisionChr - 48);
                textIndex++;
              }
            }
            next = HEAP8[((textIndex+1)|0)];
          } else {
            var precision = 6; // Standard default.
          }
          // Handle integer sizes. WARNING: These assume a 32-bit architecture!
          var argSize;
          switch (String.fromCharCode(next)) {
            case 'h':
              var nextNext = HEAP8[((textIndex+2)|0)];
              if (nextNext == 104) {
                textIndex++;
                argSize = 1; // char (actually i32 in varargs)
              } else {
                argSize = 2; // short (actually i32 in varargs)
              }
              break;
            case 'l':
              var nextNext = HEAP8[((textIndex+2)|0)];
              if (nextNext == 108) {
                textIndex++;
                argSize = 8; // long long
              } else {
                argSize = 4; // long
              }
              break;
            case 'L': // long long
            case 'q': // int64_t
            case 'j': // intmax_t
              argSize = 8;
              break;
            case 'z': // size_t
            case 't': // ptrdiff_t
            case 'I': // signed ptrdiff_t or unsigned size_t
              argSize = 4;
              break;
            default:
              argSize = null;
          }
          if (argSize) textIndex++;
          next = HEAP8[((textIndex+1)|0)];
          // Handle type specifier.
          switch (String.fromCharCode(next)) {
            case 'd': case 'i': case 'u': case 'o': case 'x': case 'X': case 'p': {
              // Integer.
              var signed = next == 100 || next == 105;
              argSize = argSize || 4;
              var currArg = getNextArg('i' + (argSize * 8));
              var origArg = currArg;
              var argText;
              // Flatten i64-1 [low, high] into a (slightly rounded) double
              if (argSize == 8) {
                currArg = Runtime.makeBigInt(currArg[0], currArg[1], next == 117);
              }
              // Truncate to requested size.
              if (argSize <= 4) {
                var limit = Math.pow(256, argSize) - 1;
                currArg = (signed ? reSign : unSign)(currArg & limit, argSize * 8);
              }
              // Format the number.
              var currAbsArg = Math.abs(currArg);
              var prefix = '';
              if (next == 100 || next == 105) {
                if (argSize == 8 && i64Math) argText = i64Math.stringify(origArg[0], origArg[1], null); else
                argText = reSign(currArg, 8 * argSize, 1).toString(10);
              } else if (next == 117) {
                if (argSize == 8 && i64Math) argText = i64Math.stringify(origArg[0], origArg[1], true); else
                argText = unSign(currArg, 8 * argSize, 1).toString(10);
                currArg = Math.abs(currArg);
              } else if (next == 111) {
                argText = (flagAlternative ? '0' : '') + currAbsArg.toString(8);
              } else if (next == 120 || next == 88) {
                prefix = flagAlternative ? '0x' : '';
                if (argSize == 8 && i64Math) {
                  if (origArg[1]) {
                    argText = (origArg[1]>>>0).toString(16);
                    var lower = (origArg[0]>>>0).toString(16);
                    while (lower.length < 8) lower = '0' + lower;
                    argText += lower;
                  } else {
                    argText = (origArg[0]>>>0).toString(16);
                  }
                } else
                if (currArg < 0) {
                  // Represent negative numbers in hex as 2's complement.
                  currArg = -currArg;
                  argText = (currAbsArg - 1).toString(16);
                  var buffer = [];
                  for (var i = 0; i < argText.length; i++) {
                    buffer.push((0xF - parseInt(argText[i], 16)).toString(16));
                  }
                  argText = buffer.join('');
                  while (argText.length < argSize * 2) argText = 'f' + argText;
                } else {
                  argText = currAbsArg.toString(16);
                }
                if (next == 88) {
                  prefix = prefix.toUpperCase();
                  argText = argText.toUpperCase();
                }
              } else if (next == 112) {
                if (currAbsArg === 0) {
                  argText = '(nil)';
                } else {
                  prefix = '0x';
                  argText = currAbsArg.toString(16);
                }
              }
              if (precisionSet) {
                while (argText.length < precision) {
                  argText = '0' + argText;
                }
              }
              // Add sign if needed
              if (flagAlwaysSigned) {
                if (currArg < 0) {
                  prefix = '-' + prefix;
                } else {
                  prefix = '+' + prefix;
                }
              }
              // Add padding.
              while (prefix.length + argText.length < width) {
                if (flagLeftAlign) {
                  argText += ' ';
                } else {
                  if (flagZeroPad) {
                    argText = '0' + argText;
                  } else {
                    prefix = ' ' + prefix;
                  }
                }
              }
              // Insert the result into the buffer.
              argText = prefix + argText;
              argText.split('').forEach(function(chr) {
                ret.push(chr.charCodeAt(0));
              });
              break;
            }
            case 'f': case 'F': case 'e': case 'E': case 'g': case 'G': {
              // Float.
              var currArg = getNextArg('double');
              var argText;
              if (isNaN(currArg)) {
                argText = 'nan';
                flagZeroPad = false;
              } else if (!isFinite(currArg)) {
                argText = (currArg < 0 ? '-' : '') + 'inf';
                flagZeroPad = false;
              } else {
                var isGeneral = false;
                var effectivePrecision = Math.min(precision, 20);
                // Convert g/G to f/F or e/E, as per:
                // http://pubs.opengroup.org/onlinepubs/9699919799/functions/printf.html
                if (next == 103 || next == 71) {
                  isGeneral = true;
                  precision = precision || 1;
                  var exponent = parseInt(currArg.toExponential(effectivePrecision).split('e')[1], 10);
                  if (precision > exponent && exponent >= -4) {
                    next = ((next == 103) ? 'f' : 'F').charCodeAt(0);
                    precision -= exponent + 1;
                  } else {
                    next = ((next == 103) ? 'e' : 'E').charCodeAt(0);
                    precision--;
                  }
                  effectivePrecision = Math.min(precision, 20);
                }
                if (next == 101 || next == 69) {
                  argText = currArg.toExponential(effectivePrecision);
                  // Make sure the exponent has at least 2 digits.
                  if (/[eE][-+]\d$/.test(argText)) {
                    argText = argText.slice(0, -1) + '0' + argText.slice(-1);
                  }
                } else if (next == 102 || next == 70) {
                  argText = currArg.toFixed(effectivePrecision);
                  if (currArg === 0 && __reallyNegative(currArg)) {
                    argText = '-' + argText;
                  }
                }
                var parts = argText.split('e');
                if (isGeneral && !flagAlternative) {
                  // Discard trailing zeros and periods.
                  while (parts[0].length > 1 && parts[0].indexOf('.') != -1 &&
                         (parts[0].slice(-1) == '0' || parts[0].slice(-1) == '.')) {
                    parts[0] = parts[0].slice(0, -1);
                  }
                } else {
                  // Make sure we have a period in alternative mode.
                  if (flagAlternative && argText.indexOf('.') == -1) parts[0] += '.';
                  // Zero pad until required precision.
                  while (precision > effectivePrecision++) parts[0] += '0';
                }
                argText = parts[0] + (parts.length > 1 ? 'e' + parts[1] : '');
                // Capitalize 'E' if needed.
                if (next == 69) argText = argText.toUpperCase();
                // Add sign.
                if (flagAlwaysSigned && currArg >= 0) {
                  argText = '+' + argText;
                }
              }
              // Add padding.
              while (argText.length < width) {
                if (flagLeftAlign) {
                  argText += ' ';
                } else {
                  if (flagZeroPad && (argText[0] == '-' || argText[0] == '+')) {
                    argText = argText[0] + '0' + argText.slice(1);
                  } else {
                    argText = (flagZeroPad ? '0' : ' ') + argText;
                  }
                }
              }
              // Adjust case.
              if (next < 97) argText = argText.toUpperCase();
              // Insert the result into the buffer.
              argText.split('').forEach(function(chr) {
                ret.push(chr.charCodeAt(0));
              });
              break;
            }
            case 's': {
              // String.
              var arg = getNextArg('i8*') || nullString;
              var argLength = _strlen(arg);
              if (precisionSet) argLength = Math.min(argLength, precision);
              if (!flagLeftAlign) {
                while (argLength < width--) {
                  ret.push(32);
                }
              }
              for (var i = 0; i < argLength; i++) {
                ret.push(HEAPU8[((arg++)|0)]);
              }
              if (flagLeftAlign) {
                while (argLength < width--) {
                  ret.push(32);
                }
              }
              break;
            }
            case 'c': {
              // Character.
              if (flagLeftAlign) ret.push(getNextArg('i8'));
              while (--width > 0) {
                ret.push(32);
              }
              if (!flagLeftAlign) ret.push(getNextArg('i8'));
              break;
            }
            case 'n': {
              // Write the length written so far to the next parameter.
              var ptr = getNextArg('i32*');
              HEAP32[((ptr)>>2)]=ret.length
              break;
            }
            case '%': {
              // Literal percent sign.
              ret.push(curr);
              break;
            }
            default: {
              // Unknown specifiers remain untouched.
              for (var i = startTextIndex; i < textIndex + 2; i++) {
                ret.push(HEAP8[(i)]);
              }
            }
          }
          textIndex += 2;
          // TODO: Support a/A (hex float) and m (last error) specifiers.
          // TODO: Support %1${specifier} for arg selection.
        } else {
          ret.push(curr);
          textIndex += 1;
        }
      }
      return ret;
    }function _fprintf(stream, format, varargs) {
      // int fprintf(FILE *restrict stream, const char *restrict format, ...);
      // http://pubs.opengroup.org/onlinepubs/000095399/functions/printf.html
      var result = __formatString(format, varargs);
      var stack = Runtime.stackSave();
      var ret = _fwrite(allocate(result, 'i8', ALLOC_STACK), 1, result.length, stream);
      Runtime.stackRestore(stack);
      return ret;
    }
  function _sysconf(name) {
      // long sysconf(int name);
      // http://pubs.opengroup.org/onlinepubs/009695399/functions/sysconf.html
      switch(name) {
        case 8: return PAGE_SIZE;
        case 54:
        case 56:
        case 21:
        case 61:
        case 63:
        case 22:
        case 67:
        case 23:
        case 24:
        case 25:
        case 26:
        case 27:
        case 69:
        case 28:
        case 101:
        case 70:
        case 71:
        case 29:
        case 30:
        case 199:
        case 75:
        case 76:
        case 32:
        case 43:
        case 44:
        case 80:
        case 46:
        case 47:
        case 45:
        case 48:
        case 49:
        case 42:
        case 82:
        case 33:
        case 7:
        case 108:
        case 109:
        case 107:
        case 112:
        case 119:
        case 121:
          return 200809;
        case 13:
        case 104:
        case 94:
        case 95:
        case 34:
        case 35:
        case 77:
        case 81:
        case 83:
        case 84:
        case 85:
        case 86:
        case 87:
        case 88:
        case 89:
        case 90:
        case 91:
        case 94:
        case 95:
        case 110:
        case 111:
        case 113:
        case 114:
        case 115:
        case 116:
        case 117:
        case 118:
        case 120:
        case 40:
        case 16:
        case 79:
        case 19:
          return -1;
        case 92:
        case 93:
        case 5:
        case 72:
        case 6:
        case 74:
        case 92:
        case 93:
        case 96:
        case 97:
        case 98:
        case 99:
        case 102:
        case 103:
        case 105:
          return 1;
        case 38:
        case 66:
        case 50:
        case 51:
        case 4:
          return 1024;
        case 15:
        case 64:
        case 41:
          return 32;
        case 55:
        case 37:
        case 17:
          return 2147483647;
        case 18:
        case 1:
          return 47839;
        case 59:
        case 57:
          return 99;
        case 68:
        case 58:
          return 2048;
        case 0: return 2097152;
        case 3: return 65536;
        case 14: return 32768;
        case 73: return 32767;
        case 39: return 16384;
        case 60: return 1000;
        case 106: return 700;
        case 52: return 256;
        case 62: return 255;
        case 2: return 100;
        case 65: return 64;
        case 36: return 20;
        case 100: return 16;
        case 20: return 6;
        case 53: return 4;
        case 10: return 1;
      }
      ___setErrNo(ERRNO_CODES.EINVAL);
      return -1;
    }
  function _sbrk(bytes) {
      // Implement a Linux-like 'memory area' for our 'process'.
      // Changes the size of the memory area by |bytes|; returns the
      // address of the previous top ('break') of the memory area
      // We need to make sure no one else allocates unfreeable memory!
      // We must control this entirely. So we don't even need to do
      // unfreeable allocations - the HEAP is ours, from STATICTOP up.
      // TODO: We could in theory slice off the top of the HEAP when
      //       sbrk gets a negative increment in |bytes|...
      var self = _sbrk;
      if (!self.called) {
        STATICTOP = alignMemoryPage(STATICTOP); // make sure we start out aligned
        self.called = true;
        _sbrk.DYNAMIC_START = STATICTOP;
      }
      var ret = STATICTOP;
      if (bytes != 0) Runtime.staticAlloc(bytes);
      return ret;  // Previous break location.
    }
  function ___gxx_personality_v0() {
    }
  function ___cxa_allocate_exception(size) {
      return _malloc(size);
    }
  function _llvm_eh_exception() {
      return HEAP32[((_llvm_eh_exception.buf)>>2)];
    }
  function __ZSt18uncaught_exceptionv() { // std::uncaught_exception()
      return !!__ZSt18uncaught_exceptionv.uncaught_exception;
    }
  function ___cxa_is_number_type(type) {
      var isNumber = false;
      try { if (type == __ZTIi) isNumber = true } catch(e){}
      try { if (type == __ZTIj) isNumber = true } catch(e){}
      try { if (type == __ZTIl) isNumber = true } catch(e){}
      try { if (type == __ZTIm) isNumber = true } catch(e){}
      try { if (type == __ZTIx) isNumber = true } catch(e){}
      try { if (type == __ZTIy) isNumber = true } catch(e){}
      try { if (type == __ZTIf) isNumber = true } catch(e){}
      try { if (type == __ZTId) isNumber = true } catch(e){}
      try { if (type == __ZTIe) isNumber = true } catch(e){}
      try { if (type == __ZTIc) isNumber = true } catch(e){}
      try { if (type == __ZTIa) isNumber = true } catch(e){}
      try { if (type == __ZTIh) isNumber = true } catch(e){}
      try { if (type == __ZTIs) isNumber = true } catch(e){}
      try { if (type == __ZTIt) isNumber = true } catch(e){}
      return isNumber;
    }function ___cxa_does_inherit(definiteType, possibilityType, possibility) {
      if (possibility == 0) return false;
      if (possibilityType == 0 || possibilityType == definiteType)
        return true;
      var possibility_type_info;
      if (___cxa_is_number_type(possibilityType)) {
        possibility_type_info = possibilityType;
      } else {
        var possibility_type_infoAddr = HEAP32[((possibilityType)>>2)] - 8;
        possibility_type_info = HEAP32[((possibility_type_infoAddr)>>2)];
      }
      switch (possibility_type_info) {
      case 0: // possibility is a pointer
        // See if definite type is a pointer
        var definite_type_infoAddr = HEAP32[((definiteType)>>2)] - 8;
        var definite_type_info = HEAP32[((definite_type_infoAddr)>>2)];
        if (definite_type_info == 0) {
          // Also a pointer; compare base types of pointers
          var defPointerBaseAddr = definiteType+8;
          var defPointerBaseType = HEAP32[((defPointerBaseAddr)>>2)];
          var possPointerBaseAddr = possibilityType+8;
          var possPointerBaseType = HEAP32[((possPointerBaseAddr)>>2)];
          return ___cxa_does_inherit(defPointerBaseType, possPointerBaseType, possibility);
        } else
          return false; // one pointer and one non-pointer
      case 1: // class with no base class
        return false;
      case 2: // class with base class
        var parentTypeAddr = possibilityType + 8;
        var parentType = HEAP32[((parentTypeAddr)>>2)];
        return ___cxa_does_inherit(definiteType, parentType, possibility);
      default:
        return false; // some unencountered type
      }
    }function ___cxa_find_matching_catch(thrown, throwntype, typeArray) {
      // If throwntype is a pointer, this means a pointer has been
      // thrown. When a pointer is thrown, actually what's thrown
      // is a pointer to the pointer. We'll dereference it.
      if (throwntype != 0 && !___cxa_is_number_type(throwntype)) {
        var throwntypeInfoAddr= HEAP32[((throwntype)>>2)] - 8;
        var throwntypeInfo= HEAP32[((throwntypeInfoAddr)>>2)];
        if (throwntypeInfo == 0)
          thrown = HEAP32[((thrown)>>2)];
      }
      // The different catch blocks are denoted by different types.
      // Due to inheritance, those types may not precisely match the
      // type of the thrown object. Find one which matches, and
      // return the type of the catch block which should be called.
      for (var i = 0; i < typeArray.length; i++) {
        if (___cxa_does_inherit(typeArray[i], throwntype, thrown))
          return tempRet0 = typeArray[i],thrown;
      }
      // Shouldn't happen unless we have bogus data in typeArray
      // or encounter a type for which emscripten doesn't have suitable
      // typeinfo defined. Best-efforts match just in case.
      return tempRet0 = throwntype,thrown;
    }function ___cxa_throw(ptr, type, destructor) {
      if (!___cxa_throw.initialized) {
        try {
          HEAP32[((__ZTVN10__cxxabiv119__pointer_type_infoE)>>2)]=0; // Workaround for libcxxabi integration bug
        } catch(e){}
        try {
          HEAP32[((__ZTVN10__cxxabiv117__class_type_infoE)>>2)]=1; // Workaround for libcxxabi integration bug
        } catch(e){}
        try {
          HEAP32[((__ZTVN10__cxxabiv120__si_class_type_infoE)>>2)]=2; // Workaround for libcxxabi integration bug
        } catch(e){}
        ___cxa_throw.initialized = true;
      }
      HEAP32[((_llvm_eh_exception.buf)>>2)]=ptr
      HEAP32[(((_llvm_eh_exception.buf)+(4))>>2)]=type
      HEAP32[(((_llvm_eh_exception.buf)+(8))>>2)]=destructor
      if (!("uncaught_exception" in __ZSt18uncaught_exceptionv)) {
        __ZSt18uncaught_exceptionv.uncaught_exception = 1;
      } else {
        __ZSt18uncaught_exceptionv.uncaught_exception++;
      }
      throw ptr + " - Exception catching is disabled, this exception cannot be caught. Compile with -s DISABLE_EXCEPTION_CATCHING=0 or DISABLE_EXCEPTION_CATCHING=2 to catch.";;
    }
  function ___cxa_call_unexpected(exception) {
      Module.printErr('Unexpected exception thrown, this is not properly supported - aborting');
      ABORT = true;
      throw exception;
    }
  function ___cxa_begin_catch(ptr) {
      __ZSt18uncaught_exceptionv.uncaught_exception--;
      return ptr;
    }
  function ___cxa_free_exception(ptr) {
      return _free(ptr);
    }function ___cxa_end_catch() {
      if (___cxa_end_catch.rethrown) {
        ___cxa_end_catch.rethrown = false;
        return;
      }
      // Clear state flag.
      __THREW__ = 0;
      // Clear type.
      HEAP32[(((_llvm_eh_exception.buf)+(4))>>2)]=0
      // Call destructor if one is registered then clear it.
      var ptr = HEAP32[((_llvm_eh_exception.buf)>>2)];
      var destructor = HEAP32[(((_llvm_eh_exception.buf)+(8))>>2)];
      if (destructor) {
        Runtime.dynCall('vi', destructor, [ptr]);
        HEAP32[(((_llvm_eh_exception.buf)+(8))>>2)]=0
      }
      // Free ptr if it isn't null.
      if (ptr) {
        ___cxa_free_exception(ptr);
        HEAP32[((_llvm_eh_exception.buf)>>2)]=0
      }
    }
  function __ZNSt9exceptionD2Ev(){}
  var _environ=allocate(1, "i32*", ALLOC_STACK);var ___environ=_environ;function ___buildEnvironment(env) {
      // WARNING: Arbitrary limit!
      var MAX_ENV_VALUES = 64;
      var TOTAL_ENV_SIZE = 1024;
      // Statically allocate memory for the environment.
      var poolPtr;
      var envPtr;
      if (!___buildEnvironment.called) {
        ___buildEnvironment.called = true;
        // Set default values. Use string keys for Closure Compiler compatibility.
        ENV['USER'] = 'root';
        ENV['PATH'] = '/';
        ENV['PWD'] = '/';
        ENV['HOME'] = '/home/emscripten';
        ENV['LANG'] = 'en_US.UTF-8';
        ENV['_'] = './this.program';
        // Allocate memory.
        poolPtr = allocate(TOTAL_ENV_SIZE, 'i8', ALLOC_STATIC);
        envPtr = allocate(MAX_ENV_VALUES * 4,
                          'i8*', ALLOC_STATIC);
        HEAP32[((envPtr)>>2)]=poolPtr
        HEAP32[((_environ)>>2)]=envPtr;
      } else {
        envPtr = HEAP32[((_environ)>>2)];
        poolPtr = HEAP32[((envPtr)>>2)];
      }
      // Collect key=value lines.
      var strings = [];
      var totalSize = 0;
      for (var key in env) {
        if (typeof env[key] === 'string') {
          var line = key + '=' + env[key];
          strings.push(line);
          totalSize += line.length;
        }
      }
      if (totalSize > TOTAL_ENV_SIZE) {
        throw new Error('Environment size exceeded TOTAL_ENV_SIZE!');
      }
      // Make new.
      var ptrSize = 4;
      for (var i = 0; i < strings.length; i++) {
        var line = strings[i];
        for (var j = 0; j < line.length; j++) {
          HEAP8[(((poolPtr)+(j))|0)]=line.charCodeAt(j);
        }
        HEAP8[(((poolPtr)+(j))|0)]=0;
        HEAP32[(((envPtr)+(i * ptrSize))>>2)]=poolPtr;
        poolPtr += line.length + 1;
      }
      HEAP32[(((envPtr)+(strings.length * ptrSize))>>2)]=0;
    }var ENV={};function _getenv(name) {
      // char *getenv(const char *name);
      // http://pubs.opengroup.org/onlinepubs/009695399/functions/getenv.html
      if (name === 0) return 0;
      name = Pointer_stringify(name);
      if (!ENV.hasOwnProperty(name)) return 0;
      if (_getenv.ret) _free(_getenv.ret);
      _getenv.ret = allocate(intArrayFromString(ENV[name]), 'i8', ALLOC_NORMAL);
      return _getenv.ret;
    }
  function _strchr(ptr, chr) {
      ptr--;
      do {
        ptr++;
        var val = HEAP8[(ptr)];
        if (val == chr) return ptr;
      } while (val);
      return 0;
    }
  function _strncmp(px, py, n) {
      var i = 0;
      while (i < n) {
        var x = HEAPU8[(((px)+(i))|0)];
        var y = HEAPU8[(((py)+(i))|0)];
        if (x == y && x == 0) return 0;
        if (x == 0) return -1;
        if (y == 0) return 1;
        if (x == y) {
          i ++;
          continue;
        } else {
          return x > y ? 1 : -1;
        }
      }
      return 0;
    }
  function _llvm_va_end() {}
var _warn; // stub for _warn
  var _vfprintf=_fprintf;
  function __exit(status) {
      // void _exit(int status);
      // http://pubs.opengroup.org/onlinepubs/000095399/functions/exit.html
      function ExitStatus() {
        this.name = "ExitStatus";
        this.message = "Program terminated with exit(" + status + ")";
        this.status = status;
        Module.print('Exit Status: ' + status);
      };
      ExitStatus.prototype = new Error();
      ExitStatus.prototype.constructor = ExitStatus;
      exitRuntime();
      ABORT = true;
      throw new ExitStatus();
    }function _exit(status) {
      __exit(status);
    }
  function _isspace(chr) {
      return chr in { 32: 0, 9: 0, 10: 0, 11: 0, 12: 0, 13: 0 };
    }
  var _llvm_memset_p0i8_i64=_memset;
  var Browser={mainLoop:{scheduler:null,shouldPause:false,paused:false,queue:[],pause:function () {
          Browser.mainLoop.shouldPause = true;
        },resume:function () {
          if (Browser.mainLoop.paused) {
            Browser.mainLoop.paused = false;
            Browser.mainLoop.scheduler();
          }
          Browser.mainLoop.shouldPause = false;
        },updateStatus:function () {
          if (Module['setStatus']) {
            var message = Module['statusMessage'] || 'Please wait...';
            var remaining = Browser.mainLoop.remainingBlockers;
            var expected = Browser.mainLoop.expectedBlockers;
            if (remaining) {
              if (remaining < expected) {
                Module['setStatus'](message + ' (' + (expected - remaining) + '/' + expected + ')');
              } else {
                Module['setStatus'](message);
              }
            } else {
              Module['setStatus']('');
            }
          }
        }},isFullScreen:false,pointerLock:false,moduleContextCreatedCallbacks:[],workers:[],init:function () {
        if (Browser.initted) return;
        Browser.initted = true;
        try {
          new Blob();
          Browser.hasBlobConstructor = true;
        } catch(e) {
          Browser.hasBlobConstructor = false;
          console.log("warning: no blob constructor, cannot create blobs with mimetypes");
        }
        Browser.BlobBuilder = typeof MozBlobBuilder != "undefined" ? MozBlobBuilder : (typeof WebKitBlobBuilder != "undefined" ? WebKitBlobBuilder : (!Browser.hasBlobConstructor ? console.log("warning: no BlobBuilder") : null));
        Browser.URLObject = typeof window != "undefined" ? (window.URL ? window.URL : window.webkitURL) : console.log("warning: cannot create object URLs");
        // Support for plugins that can process preloaded files. You can add more of these to
        // your app by creating and appending to Module.preloadPlugins.
        //
        // Each plugin is asked if it can handle a file based on the file's name. If it can,
        // it is given the file's raw data. When it is done, it calls a callback with the file's
        // (possibly modified) data. For example, a plugin might decompress a file, or it
        // might create some side data structure for use later (like an Image element, etc.).
        function getMimetype(name) {
          return {
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'bmp': 'image/bmp',
            'ogg': 'audio/ogg',
            'wav': 'audio/wav',
            'mp3': 'audio/mpeg'
          }[name.substr(-3)];
          return ret;
        }
        if (!Module["preloadPlugins"]) Module["preloadPlugins"] = [];
        var imagePlugin = {};
        imagePlugin['canHandle'] = function(name) {
          return !Module.noImageDecoding && /\.(jpg|jpeg|png|bmp)$/.exec(name);
        };
        imagePlugin['handle'] = function(byteArray, name, onload, onerror) {
          var b = null;
          if (Browser.hasBlobConstructor) {
            try {
              b = new Blob([byteArray], { type: getMimetype(name) });
            } catch(e) {
              Runtime.warnOnce('Blob constructor present but fails: ' + e + '; falling back to blob builder');
            }
          }
          if (!b) {
            var bb = new Browser.BlobBuilder();
            bb.append((new Uint8Array(byteArray)).buffer); // we need to pass a buffer, and must copy the array to get the right data range
            b = bb.getBlob();
          }
          var url = Browser.URLObject.createObjectURL(b);
          var img = new Image();
          img.onload = function() {
            assert(img.complete, 'Image ' + name + ' could not be decoded');
            var canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            var ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            Module["preloadedImages"][name] = canvas;
            Browser.URLObject.revokeObjectURL(url);
            if (onload) onload(byteArray);
          };
          img.onerror = function(event) {
            console.log('Image ' + url + ' could not be decoded');
            if (onerror) onerror();
          };
          img.src = url;
        };
        Module['preloadPlugins'].push(imagePlugin);
        var audioPlugin = {};
        audioPlugin['canHandle'] = function(name) {
          return !Module.noAudioDecoding && name.substr(-4) in { '.ogg': 1, '.wav': 1, '.mp3': 1 };
        };
        audioPlugin['handle'] = function(byteArray, name, onload, onerror) {
          var done = false;
          function finish(audio) {
            if (done) return;
            done = true;
            Module["preloadedAudios"][name] = audio;
            if (onload) onload(byteArray);
          }
          function fail() {
            if (done) return;
            done = true;
            Module["preloadedAudios"][name] = new Audio(); // empty shim
            if (onerror) onerror();
          }
          if (Browser.hasBlobConstructor) {
            try {
              var b = new Blob([byteArray], { type: getMimetype(name) });
            } catch(e) {
              return fail();
            }
            var url = Browser.URLObject.createObjectURL(b); // XXX we never revoke this!
            var audio = new Audio();
            audio.addEventListener('canplaythrough', function() { finish(audio) }, false); // use addEventListener due to chromium bug 124926
            audio.onerror = function(event) {
              if (done) return;
              console.log('warning: browser could not fully decode audio ' + name + ', trying slower base64 approach');
              function encode64(data) {
                var BASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
                var PAD = '=';
                var ret = '';
                var leftchar = 0;
                var leftbits = 0;
                for (var i = 0; i < data.length; i++) {
                  leftchar = (leftchar << 8) | data[i];
                  leftbits += 8;
                  while (leftbits >= 6) {
                    var curr = (leftchar >> (leftbits-6)) & 0x3f;
                    leftbits -= 6;
                    ret += BASE[curr];
                  }
                }
                if (leftbits == 2) {
                  ret += BASE[(leftchar&3) << 4];
                  ret += PAD + PAD;
                } else if (leftbits == 4) {
                  ret += BASE[(leftchar&0xf) << 2];
                  ret += PAD;
                }
                return ret;
              }
              audio.src = 'data:audio/x-' + name.substr(-3) + ';base64,' + encode64(byteArray);
              finish(audio); // we don't wait for confirmation this worked - but it's worth trying
            };
            audio.src = url;
            // workaround for chrome bug 124926 - we do not always get oncanplaythrough or onerror
            setTimeout(function() {
              finish(audio); // try to use it even though it is not necessarily ready to play
            }, 10000);
          } else {
            return fail();
          }
        };
        Module['preloadPlugins'].push(audioPlugin);
        // Canvas event setup
        var canvas = Module['canvas'];
        canvas.requestPointerLock = canvas['requestPointerLock'] ||
                                    canvas['mozRequestPointerLock'] ||
                                    canvas['webkitRequestPointerLock'];
        canvas.exitPointerLock = document['exitPointerLock'] ||
                                 document['mozExitPointerLock'] ||
                                 document['webkitExitPointerLock'];
        canvas.exitPointerLock = canvas.exitPointerLock.bind(document);
        function pointerLockChange() {
          Browser.pointerLock = document['pointerLockElement'] === canvas ||
                                document['mozPointerLockElement'] === canvas ||
                                document['webkitPointerLockElement'] === canvas;
        }
        document.addEventListener('pointerlockchange', pointerLockChange, false);
        document.addEventListener('mozpointerlockchange', pointerLockChange, false);
        document.addEventListener('webkitpointerlockchange', pointerLockChange, false);
        if (Module['elementPointerLock']) {
          canvas.addEventListener("click", function(ev) {
            if (!Browser.pointerLock && canvas.requestPointerLock) {
              canvas.requestPointerLock();
              ev.preventDefault();
            }
          }, false);
        }
      },createContext:function (canvas, useWebGL, setInModule) {
        var ctx;
        try {
          if (useWebGL) {
            ctx = canvas.getContext('experimental-webgl', {
              alpha: false
            });
          } else {
            ctx = canvas.getContext('2d');
          }
          if (!ctx) throw ':(';
        } catch (e) {
          Module.print('Could not create canvas - ' + e);
          return null;
        }
        if (useWebGL) {
          // Set the background of the WebGL canvas to black
          canvas.style.backgroundColor = "black";
          // Warn on context loss
          canvas.addEventListener('webglcontextlost', function(event) {
            alert('WebGL context lost. You will need to reload the page.');
          }, false);
        }
        if (setInModule) {
          Module.ctx = ctx;
          Module.useWebGL = useWebGL;
          Browser.moduleContextCreatedCallbacks.forEach(function(callback) { callback() });
          Browser.init();
        }
        return ctx;
      },destroyContext:function (canvas, useWebGL, setInModule) {},fullScreenHandlersInstalled:false,lockPointer:undefined,resizeCanvas:undefined,requestFullScreen:function (lockPointer, resizeCanvas) {
        this.lockPointer = lockPointer;
        this.resizeCanvas = resizeCanvas;
        if (typeof this.lockPointer === 'undefined') this.lockPointer = true;
        if (typeof this.resizeCanvas === 'undefined') this.resizeCanvas = false;
        var canvas = Module['canvas'];
        function fullScreenChange() {
          Browser.isFullScreen = false;
          if ((document['webkitFullScreenElement'] || document['webkitFullscreenElement'] ||
               document['mozFullScreenElement'] || document['mozFullscreenElement'] ||
               document['fullScreenElement'] || document['fullscreenElement']) === canvas) {
            canvas.cancelFullScreen = document['cancelFullScreen'] ||
                                      document['mozCancelFullScreen'] ||
                                      document['webkitCancelFullScreen'];
            canvas.cancelFullScreen = canvas.cancelFullScreen.bind(document);
            if (Browser.lockPointer) canvas.requestPointerLock();
            Browser.isFullScreen = true;
            if (Browser.resizeCanvas) Browser.setFullScreenCanvasSize();
          } else if (Browser.resizeCanvas){
            Browser.setWindowedCanvasSize();
          }
          if (Module['onFullScreen']) Module['onFullScreen'](Browser.isFullScreen);
        }
        if (!this.fullScreenHandlersInstalled) {
          this.fullScreenHandlersInstalled = true;
          document.addEventListener('fullscreenchange', fullScreenChange, false);
          document.addEventListener('mozfullscreenchange', fullScreenChange, false);
          document.addEventListener('webkitfullscreenchange', fullScreenChange, false);
        }
        canvas.requestFullScreen = canvas['requestFullScreen'] ||
                                   canvas['mozRequestFullScreen'] ||
                                   (canvas['webkitRequestFullScreen'] ? function() { canvas['webkitRequestFullScreen'](Element['ALLOW_KEYBOARD_INPUT']) } : null);
        canvas.requestFullScreen(); 
      },requestAnimationFrame:function (func) {
        if (!window.requestAnimationFrame) {
          window.requestAnimationFrame = window['requestAnimationFrame'] ||
                                         window['mozRequestAnimationFrame'] ||
                                         window['webkitRequestAnimationFrame'] ||
                                         window['msRequestAnimationFrame'] ||
                                         window['oRequestAnimationFrame'] ||
                                         window['setTimeout'];
        }
        window.requestAnimationFrame(func);
      },getMovementX:function (event) {
        return event['movementX'] ||
               event['mozMovementX'] ||
               event['webkitMovementX'] ||
               0;
      },getMovementY:function (event) {
        return event['movementY'] ||
               event['mozMovementY'] ||
               event['webkitMovementY'] ||
               0;
      },xhrLoad:function (url, onload, onerror) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.responseType = 'arraybuffer';
        xhr.onload = function() {
          if (xhr.status == 200) {
            onload(xhr.response);
          } else {
            onerror();
          }
        };
        xhr.onerror = onerror;
        xhr.send(null);
      },asyncLoad:function (url, onload, onerror, noRunDep) {
        Browser.xhrLoad(url, function(arrayBuffer) {
          assert(arrayBuffer, 'Loading data file "' + url + '" failed (no arrayBuffer).');
          onload(new Uint8Array(arrayBuffer));
          if (!noRunDep) removeRunDependency('al ' + url);
        }, function(event) {
          if (onerror) {
            onerror();
          } else {
            throw 'Loading data file "' + url + '" failed.';
          }
        });
        if (!noRunDep) addRunDependency('al ' + url);
      },resizeListeners:[],updateResizeListeners:function () {
        var canvas = Module['canvas'];
        Browser.resizeListeners.forEach(function(listener) {
          listener(canvas.width, canvas.height);
        });
      },setCanvasSize:function (width, height, noUpdates) {
        var canvas = Module['canvas'];
        canvas.width = width;
        canvas.height = height;
        if (!noUpdates) Browser.updateResizeListeners();
      },windowedWidth:0,windowedHeight:0,setFullScreenCanvasSize:function () {
        var canvas = Module['canvas'];
        this.windowedWidth = canvas.width;
        this.windowedHeight = canvas.height;
        canvas.width = screen.width;
        canvas.height = screen.height;
        var flags = HEAPU32[((SDL.screen+Runtime.QUANTUM_SIZE*0)>>2)];
        flags = flags | 0x00800000; // set SDL_FULLSCREEN flag
        HEAP32[((SDL.screen+Runtime.QUANTUM_SIZE*0)>>2)]=flags
        Browser.updateResizeListeners();
      },setWindowedCanvasSize:function () {
        var canvas = Module['canvas'];
        canvas.width = this.windowedWidth;
        canvas.height = this.windowedHeight;
        var flags = HEAPU32[((SDL.screen+Runtime.QUANTUM_SIZE*0)>>2)];
        flags = flags & ~0x00800000; // clear SDL_FULLSCREEN flag
        HEAP32[((SDL.screen+Runtime.QUANTUM_SIZE*0)>>2)]=flags
        Browser.updateResizeListeners();
      }};
__ATINIT__.unshift({ func: function() { if (!Module["noFSInit"] && !FS.init.initialized) FS.init() } });__ATMAIN__.push({ func: function() { FS.ignorePermissions = false } });__ATEXIT__.push({ func: function() { FS.quit() } });Module["FS_createFolder"] = FS.createFolder;Module["FS_createPath"] = FS.createPath;Module["FS_createDataFile"] = FS.createDataFile;Module["FS_createPreloadedFile"] = FS.createPreloadedFile;Module["FS_createLazyFile"] = FS.createLazyFile;Module["FS_createLink"] = FS.createLink;Module["FS_createDevice"] = FS.createDevice;
___setErrNo(0);
_fputc.ret = allocate([0], "i8", ALLOC_STATIC);
_llvm_eh_exception.buf = allocate(12, "void*", ALLOC_STATIC);
___buildEnvironment(ENV);
Module["requestFullScreen"] = function(lockPointer, resizeCanvas) { Browser.requestFullScreen(lockPointer, resizeCanvas) };
  Module["requestAnimationFrame"] = function(func) { Browser.requestAnimationFrame(func) };
  Module["pauseMainLoop"] = function() { Browser.mainLoop.pause() };
  Module["resumeMainLoop"] = function() { Browser.mainLoop.resume() };
var FUNCTION_TABLE = [0,0,__ZNSt20bad_array_new_lengthD0Ev,0,__ZNSt9bad_allocC2Ev,0,__ZNSt9bad_allocD0Ev,0,__errx,0,_packet_filter
,0,_enet_range_coder_destroy,0,__verrx,0,_enet_range_coder_compress,0,__ZNKSt9bad_alloc4whatEv,0,__verr
,0,__vwarnx,0,__vwarn,0,__ZNSt20bad_array_new_lengthC2Ev,0,_enet_range_coder_decompress,0,_free
,0,_warn,0,__err,0,__ZNSt9bad_allocD2Ev,0,__ZNKSt20bad_array_new_length4whatEv,0,_abort,0,_malloc,0,__warnx,0];
// EMSCRIPTEN_START_FUNCS
function _jsapi_event_get_type(r1) {
  return HEAP32[r1 >> 2];
}
function _jsapi_event_get_peer(r1) {
  return HEAP32[r1 + 4 >> 2];
}
function _jsapi_event_get_channelID(r1) {
  return HEAPU8[r1 + 8 | 0];
}
function _jsapi_event_get_packet(r1) {
  return HEAP32[r1 + 16 >> 2];
}
function _jsapi_event_get_data(r1) {
  return HEAP32[r1 + 12 >> 2];
}
function _jsapi_address_get_host(r1) {
  return r1 | 0;
}
function _jsapi_address_get_port(r1) {
  return HEAPU16[r1 + 4 >> 1];
}
function _jsapi_packet_get_data(r1) {
  return HEAP32[r1 + 8 >> 2];
}
function _jsapi_packet_get_dataLength(r1) {
  return HEAP32[r1 + 12 >> 2];
}
function _jsapi_host_get_receivedAddress(r1) {
  return r1 + 10348 | 0;
}
function _jsapi_host_get_peerCount(r1) {
  return HEAP32[r1 + 40 >> 2];
}
function _jsapi_host_get_channelLimit(r1) {
  return HEAP32[r1 + 44 >> 2];
}
function _jsapi_host_get_receivedData(r1) {
  return HEAP32[r1 + 10356 >> 2];
}
function _jsapi_host_get_receivedDataLength(r1) {
  return HEAP32[r1 + 10360 >> 2];
}
function _jsapi_host_get_socket(r1) {
  return HEAP32[r1 >> 2];
}
function _jsapi_peer_get_address(r1) {
  return r1 + 24 | 0;
}
function _jsapi_peer_get_data(r1) {
  return HEAP32[r1 + 32 >> 2];
}
function _jsapi_peer_get_channelCount(r1) {
  return HEAP32[r1 + 44 >> 2];
}
function _enet_initialize_with_callbacks(r1, r2) {
  var r3, r4, r5, r6, r7;
  r3 = 0;
  if (r1 >>> 0 < 66304) {
    r4 = -1;
    return r4;
  }
  r1 = r2 | 0;
  r5 = HEAP32[r1 >> 2];
  do {
    if ((r5 | 0) == 0) {
      if ((HEAP32[r2 + 4 >> 2] | 0) == 0) {
        break;
      }
      r6 = HEAP32[r1 >> 2];
      if ((r6 | 0) == 0) {
        r4 = -1;
      } else {
        r7 = r6;
        r3 = 23;
        break;
      }
      return r4;
    } else {
      r7 = r5;
      r3 = 23;
    }
  } while (0);
  do {
    if (r3 == 23) {
      r5 = r2 + 4 | 0;
      if ((HEAP32[r5 >> 2] | 0) == 0) {
        r4 = -1;
        return r4;
      } else {
        HEAP32[102770] = r7;
        HEAP32[102769] = HEAP32[r5 >> 2];
        break;
      }
    }
  } while (0);
  r7 = HEAP32[r2 + 8 >> 2];
  if ((r7 | 0) != 0) {
    HEAP32[102768] = r7;
  }
  r7 = HEAP32[r2 + 12 >> 2];
  if ((r7 | 0) == 0) {
    r4 = 0;
    return r4;
  }
  HEAP32[102767] = r7;
  r4 = 0;
  return r4;
}
function _packet_filter(r1) {
  return __packet_filter(r1);
}
function _jsapi_init(r1) {
  var r2, r3;
  r2 = STACKTOP;
  STACKTOP = STACKTOP + 16 | 0;
  r3 = r2;
  if ((r1 | 0) == 0) {
    STACKTOP = r2;
    return;
  }
  r1 = r3 >> 2;
  HEAP32[r1] = HEAP32[102461];
  HEAP32[r1 + 1] = HEAP32[102462];
  HEAP32[r1 + 2] = HEAP32[102463];
  HEAP32[r1 + 3] = HEAP32[102464];
  _enet_initialize_with_callbacks(66309, r3);
  STACKTOP = r2;
  return;
}
function _jsapi_enet_host_create(r1, r2, r3, r4, r5, r6) {
  var r7, r8;
  r7 = STACKTOP;
  STACKTOP = STACKTOP + 8 | 0;
  r8 = r7;
  HEAP32[r8 >> 2] = r1;
  HEAP16[r8 + 4 >> 1] = r2 & 65535;
  r2 = _enet_host_create(r8, r3, r4, r5, r6);
  STACKTOP = r7;
  return r2;
}
function _jsapi_enet_host_connect(r1, r2, r3, r4, r5) {
  var r6, r7;
  r6 = STACKTOP;
  STACKTOP = STACKTOP + 8 | 0;
  r7 = r6;
  HEAP32[r7 >> 2] = r2;
  HEAP16[r7 + 4 >> 1] = r3 & 65535;
  r3 = _enet_host_connect(r1, r7, r4, r5);
  STACKTOP = r6;
  return r3;
}
function _jsapi_event_new() {
  return _malloc(20);
}
function _jsapi_event_free(r1) {
  _free(r1);
  return;
}
function _enet_malloc(r1) {
  var r2;
  r2 = FUNCTION_TABLE[HEAP32[102770]](r1);
  if ((r2 | 0) != 0) {
    return r2;
  }
  FUNCTION_TABLE[HEAP32[102768]]();
  return r2;
}
function _enet_free(r1) {
  FUNCTION_TABLE[HEAP32[102769]](r1);
  return;
}
function _enet_packet_filter(r1) {
  var r2, r3;
  do {
    if ((HEAP32[r1 + 10360 >> 2] | 0) == 0) {
      r2 = 1;
    } else {
      r3 = HEAP32[102767];
      if ((r3 | 0) == 0) {
        r2 = 1;
        break;
      }
      r2 = FUNCTION_TABLE[r3](r1);
    }
  } while (0);
  return r2;
}
function _enet_range_coder_create() {
  return _enet_malloc(65536);
}
function _enet_range_coder_destroy(r1) {
  if ((r1 | 0) == 0) {
    return;
  }
  _enet_free(r1);
  return;
}
function _enet_range_coder_compress(r1, r2, r3, r4, r5, r6) {
  var r7, r8, r9, r10, r11, r12, r13, r14, r15, r16, r17, r18, r19, r20, r21, r22, r23, r24, r25, r26, r27, r28, r29, r30, r31, r32, r33, r34, r35, r36, r37, r38, r39, r40, r41, r42, r43, r44, r45, r46, r47, r48, r49, r50, r51, r52, r53, r54, r55, r56, r57, r58, r59, r60, r61, r62, r63, r64, r65, r66, r67, r68, r69, r70, r71, r72, r73, r74, r75, r76, r77, r78, r79, r80, r81, r82, r83, r84, r85, r86, r87, r88, r89, r90, r91, r92, r93;
  r7 = 0;
  r8 = STACKTOP;
  STACKTOP = STACKTOP + 4 | 0;
  r9 = r8, r10 = r9 >> 1;
  r11 = r5 + r6 | 0;
  HEAP16[r10] = 0;
  if ((r1 | 0) == 0 | (r3 | 0) == 0 | (r4 | 0) == 0) {
    r12 = 0;
    STACKTOP = r8;
    return r12;
  }
  r4 = HEAP32[r2 >> 2];
  r6 = r4 + HEAP32[r2 + 4 >> 2] | 0;
  r13 = r1, r14 = r13 >> 1;
  r15 = r1;
  r16 = (r1 + 8 | 0) >> 1;
  r17 = (r1 + 10 | 0) >> 1;
  r18 = (r1 + 12 | 0) >> 1;
  _memset(r1, 0, 16);
  HEAP16[r17] = 1;
  HEAP16[r18] = 257;
  HEAP16[r16] = 0;
  r19 = r1;
  r20 = r1;
  r21 = r1;
  r22 = 1;
  r23 = 0;
  r24 = -1;
  r25 = 0;
  r26 = r6;
  r6 = r4;
  r4 = r2 + 8 | 0;
  r2 = r3 - 1 | 0;
  r3 = r5;
  L70 : while (1) {
    if (r6 >>> 0 < r26 >>> 0) {
      r27 = r26;
      r28 = r6;
      r29 = r4;
      r30 = r2;
    } else {
      if ((r2 | 0) == 0) {
        r7 = 65;
        break;
      }
      r31 = HEAP32[r4 >> 2];
      r27 = r31 + HEAP32[r4 + 4 >> 2] | 0;
      r28 = r31;
      r29 = r4 + 8 | 0;
      r30 = r2 - 1 | 0;
    }
    r31 = r28 + 1 | 0;
    r32 = HEAP8[r28];
    r33 = HEAPU16[r10];
    r34 = (r33 << 4) + r13 | 0;
    L76 : do {
      if ((r34 | 0) == (r15 | 0)) {
        r35 = r3;
        r36 = r25;
        r37 = r24;
        r38 = r22;
        r39 = r9;
        r7 = 101;
      } else {
        r40 = r3;
        r41 = r25;
        r42 = r24;
        r43 = r22;
        r44 = r9;
        r45 = r33;
        r46 = r34;
        while (1) {
          r47 = ((r45 << 4) + r13 + 8 | 0) >> 1;
          r48 = HEAP16[r47];
          do {
            if (r48 << 16 >> 16 == 0) {
              r49 = (r43 << 4) + r13 | 0;
              HEAP8[r49 | 0] = r32;
              HEAP8[(r43 << 4) + r13 + 1 | 0] = 2;
              HEAP16[((r43 << 4) + 2 >> 1) + r14] = 2;
              r50 = ((r43 << 4) + r13 + 4 | 0) >> 1;
              HEAP16[r50] = 0;
              HEAP16[r50 + 1] = 0;
              HEAP16[r50 + 2] = 0;
              HEAP16[r50 + 3] = 0;
              HEAP16[r50 + 4] = 0;
              HEAP16[r50 + 5] = 0;
              HEAP16[r47] = (r49 - r46 | 0) >>> 4 & 65535;
              r51 = 0;
              r52 = 0;
              r53 = r49;
              r54 = r43 + 1 | 0;
            } else {
              r49 = ((r48 & 65535) + r45 << 4) + r13 | 0;
              r50 = 0;
              L82 : while (1) {
                r55 = HEAP8[r49 | 0];
                L84 : do {
                  if ((r32 & 255) < (r55 & 255)) {
                    r56 = r49;
                    while (1) {
                      r57 = r56 + 2 | 0;
                      HEAP16[r57 >> 1] = HEAP16[r57 >> 1] + 2 & 65535;
                      r58 = r56 + 4 | 0;
                      r57 = HEAP16[r58 >> 1];
                      if (r57 << 16 >> 16 == 0) {
                        r7 = 74;
                        break L82;
                      }
                      r59 = ((r57 & 65535) << 4) + r56 | 0;
                      r57 = HEAP8[r59 | 0];
                      if ((r32 & 255) < (r57 & 255)) {
                        r56 = r59;
                      } else {
                        r60 = r59;
                        r61 = r57;
                        break L84;
                      }
                    }
                  } else {
                    r60 = r49;
                    r61 = r55;
                  }
                } while (0);
                if ((r32 & 255) <= (r61 & 255)) {
                  r7 = 79;
                  break;
                }
                r62 = HEAP16[r60 + 2 >> 1] + r50 & 65535;
                r63 = r60 + 6 | 0;
                r55 = HEAP16[r63 >> 1];
                if (r55 << 16 >> 16 == 0) {
                  r7 = 78;
                  break;
                }
                r49 = ((r55 & 65535) << 4) + r60 | 0;
                r50 = r62;
              }
              if (r7 == 74) {
                r7 = 0;
                r49 = (r43 << 4) + r13 | 0;
                HEAP8[r49 | 0] = r32;
                HEAP8[(r43 << 4) + r13 + 1 | 0] = 2;
                HEAP16[((r43 << 4) + 2 >> 1) + r14] = 2;
                r55 = ((r43 << 4) + r13 + 4 | 0) >> 1;
                HEAP16[r55] = 0;
                HEAP16[r55 + 1] = 0;
                HEAP16[r55 + 2] = 0;
                HEAP16[r55 + 3] = 0;
                HEAP16[r55 + 4] = 0;
                HEAP16[r55 + 5] = 0;
                HEAP16[r58 >> 1] = (r49 - r56 | 0) >>> 4 & 65535;
                r51 = r50;
                r52 = 0;
                r53 = r49;
                r54 = r43 + 1 | 0;
                break;
              } else if (r7 == 78) {
                r7 = 0;
                r49 = (r43 << 4) + r13 | 0;
                HEAP8[r49 | 0] = r32;
                HEAP8[(r43 << 4) + r13 + 1 | 0] = 2;
                HEAP16[((r43 << 4) + 2 >> 1) + r14] = 2;
                r55 = ((r43 << 4) + r13 + 4 | 0) >> 1;
                HEAP16[r55] = 0;
                HEAP16[r55 + 1] = 0;
                HEAP16[r55 + 2] = 0;
                HEAP16[r55 + 3] = 0;
                HEAP16[r55 + 4] = 0;
                HEAP16[r55 + 5] = 0;
                HEAP16[r63 >> 1] = (r49 - r60 | 0) >>> 4 & 65535;
                r51 = r62;
                r52 = 0;
                r53 = r49;
                r54 = r43 + 1 | 0;
                break;
              } else if (r7 == 79) {
                r7 = 0;
                r49 = r60 + 1 | 0;
                r55 = HEAPU8[r49];
                r57 = r60 + 2 | 0;
                r59 = HEAP16[r57 >> 1];
                HEAP16[r57 >> 1] = r59 + 2 & 65535;
                HEAP8[r49] = HEAP8[r49] + 2 & 255;
                r51 = (r50 & 65535) - r55 + (r59 & 65535) & 65535;
                r52 = r55;
                r53 = r60;
                r54 = r43;
                break;
              }
            }
          } while (0);
          HEAP16[r44 >> 1] = (r53 - r21 | 0) >>> 4 & 65535;
          r48 = r53 + 14 | 0;
          r55 = ((r45 << 4) + r13 + 12 | 0) >> 1;
          r59 = HEAP16[r55];
          r49 = (r52 | 0) != 0;
          L96 : do {
            if (r49) {
              r57 = Math.floor((r42 >>> 0) / ((r59 & 65535) >>> 0));
              r64 = Math.imul(HEAPU16[((r45 << 4) + 10 >> 1) + r14] + (r51 & 65535) | 0, r57) + r41 | 0;
              r65 = Math.imul(r57, r52);
              r57 = r64;
              r64 = r40;
              while (1) {
                if ((r65 + r57 ^ r57) >>> 0 > 16777215) {
                  if (r65 >>> 0 > 65535) {
                    r66 = r65;
                    r67 = r57;
                    r68 = r64;
                    break L96;
                  }
                  r69 = -r57 & 65535;
                } else {
                  r69 = r65;
                }
                if (r64 >>> 0 >= r11 >>> 0) {
                  r12 = 0;
                  r7 = 133;
                  break L70;
                }
                HEAP8[r64] = r57 >>> 24 & 255;
                r65 = r69 << 8;
                r57 = r57 << 8;
                r64 = r64 + 1 | 0;
              }
            } else {
              r64 = ((r45 << 4) + r13 + 10 | 0) >> 1;
              r57 = HEAP16[r64];
              L106 : do {
                if (r57 << 16 >> 16 != 0 & (r57 & 65535) < (r59 & 65535)) {
                  r65 = Math.imul(Math.floor((r42 >>> 0) / ((r59 & 65535) >>> 0)), r57 & 65535);
                  r50 = r41;
                  r70 = r40;
                  while (1) {
                    if ((r65 + r50 ^ r50) >>> 0 > 16777215) {
                      if (r65 >>> 0 > 65535) {
                        r71 = r65;
                        r72 = r50;
                        r73 = r70;
                        break L106;
                      }
                      r74 = -r50 & 65535;
                    } else {
                      r74 = r65;
                    }
                    if (r70 >>> 0 >= r11 >>> 0) {
                      r12 = 0;
                      r7 = 134;
                      break L70;
                    }
                    HEAP8[r70] = r50 >>> 24 & 255;
                    r65 = r74 << 8;
                    r50 = r50 << 8;
                    r70 = r70 + 1 | 0;
                  }
                } else {
                  r71 = r42;
                  r72 = r41;
                  r73 = r40;
                }
              } while (0);
              HEAP16[r64] = HEAP16[r64] + 5 & 65535;
              HEAP16[r55] = HEAP16[r55] + 5 & 65535;
              r66 = r71;
              r67 = r72;
              r68 = r73;
            }
          } while (0);
          r59 = HEAP16[r55] + 2 & 65535;
          HEAP16[r55] = r59;
          if (r52 >>> 0 > 251 | (r59 & 65535) > 65280) {
            r59 = HEAP16[r47];
            if (r59 << 16 >> 16 == 0) {
              r75 = 0;
            } else {
              r75 = _enet_symbol_rescale(((r59 & 65535) + r45 << 4) + r13 | 0);
            }
            HEAP16[r55] = r75;
            r59 = (r45 << 4) + r13 + 10 | 0;
            r57 = HEAP16[r59 >> 1];
            r70 = r57 - ((r57 & 65535) >>> 1) & 65535;
            HEAP16[r59 >> 1] = r70;
            HEAP16[r55] = r70 + HEAP16[r55] & 65535;
          }
          if (r49) {
            r76 = r54;
            r77 = r66;
            r78 = r67;
            r79 = r68;
            break L76;
          }
          r70 = HEAPU16[((r45 << 4) + 14 >> 1) + r14];
          r59 = (r70 << 4) + r13 | 0;
          if ((r59 | 0) == (r15 | 0)) {
            r35 = r68;
            r36 = r67;
            r37 = r66;
            r38 = r54;
            r39 = r48;
            r7 = 101;
            break L76;
          } else {
            r40 = r68;
            r41 = r67;
            r42 = r66;
            r43 = r54;
            r44 = r48;
            r45 = r70;
            r46 = r59;
          }
        }
      }
    } while (0);
    do {
      if (r7 == 101) {
        r7 = 0;
        r34 = r32 & 255;
        r33 = HEAP16[r16];
        do {
          if (r33 << 16 >> 16 == 0) {
            r46 = (r38 << 4) + r13 | 0;
            HEAP8[r46 | 0] = r32;
            HEAP8[(r38 << 4) + r13 + 1 | 0] = 3;
            HEAP16[((r38 << 4) + 2 >> 1) + r14] = 3;
            r45 = ((r38 << 4) + r13 + 4 | 0) >> 1;
            HEAP16[r45] = 0;
            HEAP16[r45 + 1] = 0;
            HEAP16[r45 + 2] = 0;
            HEAP16[r45 + 3] = 0;
            HEAP16[r45 + 4] = 0;
            HEAP16[r45 + 5] = 0;
            HEAP16[r16] = (r46 - r19 | 0) >>> 4 & 65535;
            r80 = r34;
            r81 = 1;
            r82 = r46;
            r83 = r38 + 1 | 0;
          } else {
            r46 = ((r33 & 65535) << 4) + r15 | 0;
            r45 = r34;
            L129 : while (1) {
              r44 = HEAP8[r46 | 0];
              L131 : do {
                if ((r32 & 255) < (r44 & 255)) {
                  r84 = r46;
                  while (1) {
                    r43 = r84 + 2 | 0;
                    HEAP16[r43 >> 1] = HEAP16[r43 >> 1] + 3 & 65535;
                    r85 = r84 + 4 | 0;
                    r43 = HEAP16[r85 >> 1];
                    if (r43 << 16 >> 16 == 0) {
                      r7 = 107;
                      break L129;
                    }
                    r42 = ((r43 & 65535) << 4) + r84 | 0;
                    r43 = HEAP8[r42 | 0];
                    if ((r32 & 255) < (r43 & 255)) {
                      r84 = r42;
                    } else {
                      r86 = r42;
                      r87 = r43;
                      break L131;
                    }
                  }
                } else {
                  r86 = r46;
                  r87 = r44;
                }
              } while (0);
              if ((r32 & 255) <= (r87 & 255)) {
                r7 = 112;
                break;
              }
              r88 = HEAP16[r86 + 2 >> 1] + r45 & 65535;
              r89 = r86 + 6 | 0;
              r44 = HEAP16[r89 >> 1];
              if (r44 << 16 >> 16 == 0) {
                r7 = 111;
                break;
              }
              r46 = ((r44 & 65535) << 4) + r86 | 0;
              r45 = r88;
            }
            if (r7 == 107) {
              r7 = 0;
              r46 = (r38 << 4) + r13 | 0;
              HEAP8[r46 | 0] = r32;
              HEAP8[(r38 << 4) + r13 + 1 | 0] = 3;
              HEAP16[((r38 << 4) + 2 >> 1) + r14] = 3;
              r48 = ((r38 << 4) + r13 + 4 | 0) >> 1;
              HEAP16[r48] = 0;
              HEAP16[r48 + 1] = 0;
              HEAP16[r48 + 2] = 0;
              HEAP16[r48 + 3] = 0;
              HEAP16[r48 + 4] = 0;
              HEAP16[r48 + 5] = 0;
              HEAP16[r85 >> 1] = (r46 - r84 | 0) >>> 4 & 65535;
              r80 = r45;
              r81 = 1;
              r82 = r46;
              r83 = r38 + 1 | 0;
              break;
            } else if (r7 == 111) {
              r7 = 0;
              r46 = (r38 << 4) + r13 | 0;
              HEAP8[r46 | 0] = r32;
              HEAP8[(r38 << 4) + r13 + 1 | 0] = 3;
              HEAP16[((r38 << 4) + 2 >> 1) + r14] = 3;
              r48 = ((r38 << 4) + r13 + 4 | 0) >> 1;
              HEAP16[r48] = 0;
              HEAP16[r48 + 1] = 0;
              HEAP16[r48 + 2] = 0;
              HEAP16[r48 + 3] = 0;
              HEAP16[r48 + 4] = 0;
              HEAP16[r48 + 5] = 0;
              HEAP16[r89 >> 1] = (r46 - r86 | 0) >>> 4 & 65535;
              r80 = r88;
              r81 = 1;
              r82 = r46;
              r83 = r38 + 1 | 0;
              break;
            } else if (r7 == 112) {
              r7 = 0;
              r46 = r86 + 1 | 0;
              r48 = HEAPU8[r46];
              r49 = r86 + 2 | 0;
              r55 = HEAP16[r49 >> 1];
              HEAP16[r49 >> 1] = r55 + 3 & 65535;
              HEAP8[r46] = HEAP8[r46] + 3 & 255;
              r80 = (r45 & 65535) - r48 + (r55 & 65535) & 65535;
              r81 = r48 + 1 | 0;
              r82 = r86;
              r83 = r38;
              break;
            }
          }
        } while (0);
        HEAP16[r39 >> 1] = (r82 - r20 | 0) >>> 4 & 65535;
        r34 = Math.floor((r37 >>> 0) / (HEAPU16[r18] >>> 0));
        r33 = Math.imul(HEAPU16[r17] + (r80 & 65535) | 0, r34) + r36 | 0;
        r48 = Math.imul(r34, r81);
        r34 = r33;
        r33 = r35;
        while (1) {
          if ((r48 + r34 ^ r34) >>> 0 > 16777215) {
            if (r48 >>> 0 > 65535) {
              break;
            }
            r90 = -r34 & 65535;
          } else {
            r90 = r48;
          }
          if (r33 >>> 0 >= r11 >>> 0) {
            r12 = 0;
            r7 = 135;
            break L70;
          }
          HEAP8[r33] = r34 >>> 24 & 255;
          r48 = r90 << 8;
          r34 = r34 << 8;
          r33 = r33 + 1 | 0;
        }
        r55 = HEAP16[r18] + 3 & 65535;
        HEAP16[r18] = r55;
        if (!(r81 >>> 0 > 250 | (r55 & 65535) > 65280)) {
          r76 = r83;
          r77 = r48;
          r78 = r34;
          r79 = r33;
          break;
        }
        r55 = HEAP16[r16];
        if (r55 << 16 >> 16 == 0) {
          r91 = 0;
        } else {
          r91 = _enet_symbol_rescale(((r55 & 65535) << 4) + r15 | 0);
        }
        HEAP16[r18] = r91;
        r55 = HEAP16[r17];
        r46 = r55 - ((r55 & 65535) >>> 1) & 65535;
        HEAP16[r17] = r46;
        HEAP16[r18] = (HEAP16[r18] + 256 & 65535) + r46 & 65535;
        r76 = r83;
        r77 = r48;
        r78 = r34;
        r79 = r33;
      }
    } while (0);
    if (r23 >>> 0 > 1) {
      HEAP16[r10] = HEAP16[((HEAPU16[r10] << 4) + 14 >> 1) + r14];
      r92 = r23;
    } else {
      r92 = r23 + 1 | 0;
    }
    if (r76 >>> 0 <= 4093) {
      r22 = r76;
      r23 = r92;
      r24 = r77;
      r25 = r78;
      r26 = r27;
      r6 = r31;
      r4 = r29;
      r2 = r30;
      r3 = r79;
      continue;
    }
    _memset(r1, 0, 16);
    HEAP16[r17] = 1;
    HEAP16[r18] = 257;
    HEAP16[r16] = 0;
    HEAP16[r10] = 0;
    r22 = 1;
    r23 = 0;
    r24 = r77;
    r25 = r78;
    r26 = r27;
    r6 = r31;
    r4 = r29;
    r2 = r30;
    r3 = r79;
  }
  if (r7 == 65) {
    L163 : do {
      if ((r25 | 0) == 0) {
        r93 = r3;
      } else {
        r79 = r3;
        r30 = r25;
        while (1) {
          if (r79 >>> 0 >= r11 >>> 0) {
            r12 = 0;
            break;
          }
          r2 = r79 + 1 | 0;
          HEAP8[r79] = r30 >>> 24 & 255;
          r29 = r30 << 8;
          if ((r29 | 0) == 0) {
            r93 = r2;
            break L163;
          } else {
            r79 = r2;
            r30 = r29;
          }
        }
        STACKTOP = r8;
        return r12;
      }
    } while (0);
    r12 = r93 - r5 | 0;
    STACKTOP = r8;
    return r12;
  } else if (r7 == 133) {
    STACKTOP = r8;
    return r12;
  } else if (r7 == 134) {
    STACKTOP = r8;
    return r12;
  } else if (r7 == 135) {
    STACKTOP = r8;
    return r12;
  }
}
function _enet_symbol_rescale(r1) {
  var r2, r3, r4, r5, r6;
  r2 = 0;
  r3 = r1;
  while (1) {
    r1 = r3 + 1 | 0;
    r4 = HEAP8[r1];
    r5 = r4 - ((r4 & 255) >>> 1) & 255;
    HEAP8[r1] = r5;
    r1 = (r3 + 2 | 0) >> 1;
    HEAP16[r1] = r5 & 255;
    r5 = HEAP16[r3 + 4 >> 1];
    if (r5 << 16 >> 16 != 0) {
      HEAP16[r1] = _enet_symbol_rescale(((r5 & 65535) << 4) + r3 | 0) + HEAP16[r1] & 65535;
    }
    r6 = HEAPU16[r1] + r2 | 0;
    r1 = HEAP16[r3 + 6 >> 1];
    if (r1 << 16 >> 16 == 0) {
      break;
    }
    r2 = r6 & 65535;
    r3 = ((r1 & 65535) << 4) + r3 | 0;
  }
  return r6 & 65535;
}
function _enet_range_coder_decompress(r1, r2, r3, r4, r5) {
  var r6, r7, r8, r9, r10, r11, r12, r13, r14, r15, r16, r17, r18, r19, r20, r21, r22, r23, r24, r25, r26, r27, r28, r29, r30, r31, r32, r33, r34, r35, r36, r37, r38, r39, r40, r41, r42, r43, r44, r45, r46, r47, r48, r49, r50, r51, r52, r53, r54, r55, r56, r57, r58, r59, r60, r61, r62, r63, r64, r65, r66, r67, r68, r69, r70, r71, r72, r73, r74, r75, r76, r77, r78, r79, r80, r81, r82, r83, r84, r85, r86, r87, r88, r89, r90, r91, r92, r93, r94, r95, r96, r97, r98, r99, r100, r101, r102, r103, r104, r105, r106, r107, r108, r109, r110, r111, r112, r113, r114, r115, r116, r117, r118, r119, r120, r121, r122, r123, r124, r125, r126, r127, r128, r129, r130, r131, r132;
  r6 = 0;
  r7 = STACKTOP;
  STACKTOP = STACKTOP + 4 | 0;
  r8 = r7, r9 = r8 >> 1;
  r10 = r4 + r5 | 0;
  r5 = r2 + r3 | 0;
  HEAP16[r9] = 0;
  if ((r1 | 0) == 0 | (r3 | 0) == 0) {
    r11 = 0;
    STACKTOP = r7;
    return r11;
  }
  r12 = r1, r13 = r12 >> 1;
  r14 = r1;
  r15 = (r1 + 8 | 0) >> 1;
  r16 = (r1 + 10 | 0) >> 1;
  r17 = (r1 + 12 | 0) >> 1;
  _memset(r1, 0, 16);
  HEAP16[r16] = 1;
  HEAP16[r17] = 257;
  HEAP16[r15] = 0;
  if ((r3 | 0) > 0) {
    r18 = r2 + 1 | 0;
    r19 = HEAPU8[r2] << 24;
  } else {
    r18 = r2;
    r19 = 0;
  }
  if (r18 >>> 0 < r5 >>> 0) {
    r20 = r18 + 1 | 0;
    r21 = HEAPU8[r18] << 16 | r19;
  } else {
    r20 = r18;
    r21 = r19;
  }
  if (r20 >>> 0 < r5 >>> 0) {
    r22 = r20 + 1 | 0;
    r23 = HEAPU8[r20] << 8 | r21;
  } else {
    r22 = r20;
    r23 = r21;
  }
  if (r22 >>> 0 < r5 >>> 0) {
    r24 = r22 + 1 | 0;
    r25 = HEAPU8[r22] | r23;
  } else {
    r24 = r22;
    r25 = r23;
  }
  r23 = r1;
  r22 = r1;
  r21 = r1;
  r20 = r1;
  r19 = r24;
  r24 = r4;
  r18 = 0;
  r2 = 1;
  r3 = 0;
  r26 = -1;
  r27 = r25;
  L197 : while (1) {
    r25 = HEAP16[r9];
    r28 = r25 & 65535;
    L199 : do {
      if (((r28 << 4) + r12 | 0) == (r14 | 0)) {
        r29 = r27;
        r30 = r26;
        r31 = r18;
        r32 = r19;
        r33 = r25;
        r6 = 185;
      } else {
        r34 = r27;
        r35 = r26;
        r36 = r18;
        r37 = r19;
        r38 = r25;
        r39 = r28;
        L200 : while (1) {
          r40 = ((r39 << 4) + r12 + 10 | 0) >> 1;
          r41 = HEAP16[r40];
          r42 = r41 & 65535;
          L202 : do {
            if (r41 << 16 >> 16 == 0) {
              r43 = r37;
              r44 = r36;
              r45 = r35;
              r46 = r34;
            } else {
              r47 = ((r39 << 4) + r12 + 12 | 0) >> 1;
              r48 = HEAP16[r47];
              if ((r41 & 65535) >= (r48 & 65535)) {
                r43 = r37;
                r44 = r36;
                r45 = r35;
                r46 = r34;
                break;
              }
              r49 = Math.floor((r35 >>> 0) / ((r48 & 65535) >>> 0));
              r50 = Math.floor(((r34 - r36 | 0) >>> 0) / (r49 >>> 0));
              if ((r50 & 65535) >>> 0 >= r42 >>> 0) {
                break L200;
              }
              r48 = r37;
              r51 = r36;
              r52 = Math.imul(r49, r42);
              r53 = r34;
              while (1) {
                if ((r51 + r52 ^ r51) >>> 0 > 16777215) {
                  if (r52 >>> 0 > 65535) {
                    r43 = r48;
                    r44 = r51;
                    r45 = r52;
                    r46 = r53;
                    break L202;
                  }
                  r54 = -r51 & 65535;
                } else {
                  r54 = r52;
                }
                r55 = r53 << 8;
                if (r48 >>> 0 < r5 >>> 0) {
                  r56 = r48 + 1 | 0;
                  r57 = HEAPU8[r48] | r55;
                } else {
                  r56 = r48;
                  r57 = r55;
                }
                r48 = r56;
                r51 = r51 << 8;
                r52 = r54 << 8;
                r53 = r57;
              }
            }
          } while (0);
          r41 = HEAP16[((r39 << 4) + 14 >> 1) + r13];
          r53 = r41 & 65535;
          if (((r53 << 4) + r12 | 0) == (r14 | 0)) {
            r29 = r46;
            r30 = r45;
            r31 = r44;
            r32 = r43;
            r33 = r41;
            r6 = 185;
            break L199;
          } else {
            r34 = r46;
            r35 = r45;
            r36 = r44;
            r37 = r43;
            r38 = r41;
            r39 = r53;
          }
        }
        r35 = (r39 << 4) + r12 + 8 | 0;
        r53 = HEAP16[r35 >> 1];
        if (r53 << 16 >> 16 == 0) {
          r11 = 0;
          r6 = 242;
          break L197;
        }
        r41 = r50 - r42 & 65535;
        r52 = ((r53 & 65535) + r39 << 4) + r12 | 0;
        r53 = 0;
        L218 : while (1) {
          r51 = r52 + 2 | 0;
          r48 = HEAP16[r51 >> 1];
          r55 = r48 + r53 & 65535;
          r58 = r55 & 65535;
          L220 : do {
            if (r41 >>> 0 < r58 >>> 0) {
              r59 = r51;
              r60 = r48;
              r61 = r52;
              r62 = r58;
              while (1) {
                r63 = HEAP8[r61 | 0];
                r64 = r61 + 1 | 0;
                r65 = HEAP8[r64];
                r66 = r65 & 255;
                r67 = r62 - r66 | 0;
                HEAP16[r59 >> 1] = r60 + 2 & 65535;
                if ((r41 | 0) >= (r67 | 0)) {
                  break L218;
                }
                r68 = HEAP16[r61 + 4 >> 1];
                if (r68 << 16 >> 16 == 0) {
                  r11 = 0;
                  r6 = 244;
                  break L197;
                }
                r69 = r68 & 65535;
                r68 = (r69 << 4) + r61 | 0;
                r70 = (r69 << 4) + r61 + 2 | 0;
                r69 = HEAP16[r70 >> 1];
                r71 = r69 + r53 & 65535;
                r72 = r71 & 65535;
                if (r41 >>> 0 < r72 >>> 0) {
                  r59 = r70;
                  r60 = r69;
                  r61 = r68;
                  r62 = r72;
                } else {
                  r73 = r68;
                  r74 = r71;
                  break L220;
                }
              }
            } else {
              r73 = r52;
              r74 = r55;
            }
          } while (0);
          r55 = HEAP16[r73 + 6 >> 1];
          if (r55 << 16 >> 16 == 0) {
            r11 = 0;
            r6 = 243;
            break L197;
          }
          r52 = ((r55 & 65535) << 4) + r73 | 0;
          r53 = r74;
        }
        HEAP8[r64] = HEAP8[r64] + 2 & 255;
        r53 = (r61 - r20 | 0) >>> 4;
        r52 = r37;
        r41 = Math.imul(HEAPU16[r40] + (r67 & 65535) | 0, r49) + r36 | 0;
        r55 = Math.imul(r66, r49);
        r58 = r34;
        while (1) {
          if ((r41 + r55 ^ r41) >>> 0 > 16777215) {
            if (r55 >>> 0 > 65535) {
              break;
            }
            r75 = -r41 & 65535;
          } else {
            r75 = r55;
          }
          r48 = r58 << 8;
          if (r52 >>> 0 < r5 >>> 0) {
            r76 = r52 + 1 | 0;
            r77 = HEAPU8[r52] | r48;
          } else {
            r76 = r52;
            r77 = r48;
          }
          r52 = r76;
          r41 = r41 << 8;
          r55 = r75 << 8;
          r58 = r77;
        }
        r34 = r53 & 65535;
        r36 = HEAP16[r47] + 2 & 65535;
        HEAP16[r47] = r36;
        if (!((r65 & 255) > 251 | (r36 & 65535) > 65280)) {
          r78 = r52;
          r79 = r41;
          r80 = r34;
          r81 = r63;
          r82 = r2;
          r83 = r55;
          r84 = r58;
          r85 = r38;
          break;
        }
        r36 = HEAP16[r35 >> 1];
        if (r36 << 16 >> 16 == 0) {
          r86 = 0;
        } else {
          r86 = _enet_symbol_rescale(((r36 & 65535) + r39 << 4) + r12 | 0);
        }
        HEAP16[r47] = r86;
        r36 = HEAP16[r40];
        r37 = r36 - ((r36 & 65535) >>> 1) & 65535;
        HEAP16[r40] = r37;
        HEAP16[r47] = r37 + HEAP16[r47] & 65535;
        r78 = r52;
        r79 = r41;
        r80 = r34;
        r81 = r63;
        r82 = r2;
        r83 = r55;
        r84 = r58;
        r85 = r38;
        break;
      }
    } while (0);
    do {
      if (r6 == 185) {
        r6 = 0;
        r87 = Math.floor((r30 >>> 0) / (HEAPU16[r17] >>> 0));
        r28 = Math.floor(((r29 - r31 | 0) >>> 0) / (r87 >>> 0));
        r88 = HEAPU16[r16];
        if ((r28 & 65535) >>> 0 < r88 >>> 0) {
          r6 = 186;
          break L197;
        }
        r25 = r28 - r88 | 0;
        r28 = HEAP16[r15];
        do {
          if (r28 << 16 >> 16 == 0) {
            r34 = r25 & 255;
            r37 = (r2 << 4) + r12 | 0;
            HEAP8[r37 | 0] = r34;
            HEAP8[(r2 << 4) + r12 + 1 | 0] = 3;
            HEAP16[((r2 << 4) + 2 >> 1) + r13] = 3;
            r36 = ((r2 << 4) + r12 + 4 | 0) >> 1;
            HEAP16[r36] = 0;
            HEAP16[r36 + 1] = 0;
            HEAP16[r36 + 2] = 0;
            HEAP16[r36 + 3] = 0;
            HEAP16[r36 + 4] = 0;
            HEAP16[r36 + 5] = 0;
            HEAP16[r15] = (r37 - r23 | 0) >>> 4 & 65535;
            r89 = 1;
            r90 = r25;
            r91 = r34;
            r92 = r37;
            r93 = r2 + 1 | 0;
          } else {
            r37 = r25 & 65535;
            r34 = ((r28 & 65535) << 4) + r14 | 0;
            r36 = 0;
            L248 : while (1) {
              r48 = r34 + 2 | 0;
              r51 = HEAP16[r48 >> 1];
              r62 = (r51 & 65535) + r36 | 0;
              r60 = r34 | 0;
              r59 = HEAP8[r60];
              r71 = (r59 & 255) + 1 | 0;
              r68 = r71 + r62 | 0;
              r72 = r68 & 65535;
              L250 : do {
                if (r37 >>> 0 < r72 >>> 0) {
                  r69 = r48;
                  r70 = r51;
                  r94 = r60;
                  r95 = r59;
                  r96 = r34;
                  r97 = r72;
                  while (1) {
                    r98 = r96 + 1 | 0;
                    r99 = HEAPU8[r98] + 1 | 0;
                    r100 = r97 - r99 | 0;
                    HEAP16[r69 >> 1] = r70 + 3 & 65535;
                    if ((r37 | 0) >= (r100 | 0)) {
                      r6 = 202;
                      break L248;
                    }
                    r101 = r96 + 4 | 0;
                    r102 = HEAP16[r101 >> 1];
                    if (r102 << 16 >> 16 == 0) {
                      r6 = 201;
                      break L248;
                    }
                    r103 = r102 & 65535;
                    r102 = (r103 << 4) + r96 | 0;
                    r104 = (r103 << 4) + r96 + 2 | 0;
                    r103 = HEAP16[r104 >> 1];
                    r105 = (r103 & 65535) + r36 | 0;
                    r106 = r102 | 0;
                    r107 = HEAP8[r106];
                    r108 = (r107 & 255) + 1 | 0;
                    r109 = r108 + r105 | 0;
                    r110 = r109 & 65535;
                    if (r37 >>> 0 < r110 >>> 0) {
                      r69 = r104;
                      r70 = r103;
                      r94 = r106;
                      r95 = r107;
                      r96 = r102;
                      r97 = r110;
                    } else {
                      r111 = r102;
                      r112 = r105;
                      r113 = r108;
                      r114 = r109;
                      break L250;
                    }
                  }
                } else {
                  r111 = r34;
                  r112 = r62;
                  r113 = r71;
                  r114 = r68;
                }
              } while (0);
              r115 = r111 + 6 | 0;
              r68 = HEAP16[r115 >> 1];
              if (r68 << 16 >> 16 == 0) {
                r6 = 197;
                break;
              }
              r34 = ((r68 & 65535) << 4) + r111 | 0;
              r36 = r112 & 65535;
            }
            if (r6 == 197) {
              r6 = 0;
              r36 = r113 + r25 - r114 & 255;
              r34 = (r2 << 4) + r12 | 0;
              HEAP8[r34 | 0] = r36;
              HEAP8[(r2 << 4) + r12 + 1 | 0] = 3;
              HEAP16[((r2 << 4) + 2 >> 1) + r13] = 3;
              r68 = ((r2 << 4) + r12 + 4 | 0) >> 1;
              HEAP16[r68] = 0;
              HEAP16[r68 + 1] = 0;
              HEAP16[r68 + 2] = 0;
              HEAP16[r68 + 3] = 0;
              HEAP16[r68 + 4] = 0;
              HEAP16[r68 + 5] = 0;
              HEAP16[r115 >> 1] = (r34 - r111 | 0) >>> 4 & 65535;
              r89 = 1;
              r90 = r37;
              r91 = r36;
              r92 = r34;
              r93 = r2 + 1 | 0;
              break;
            } else if (r6 == 201) {
              r6 = 0;
              r34 = r25 - r100 + HEAPU8[r94] & 255;
              r36 = (r2 << 4) + r12 | 0;
              HEAP8[r36 | 0] = r34;
              HEAP8[(r2 << 4) + r12 + 1 | 0] = 3;
              HEAP16[((r2 << 4) + 2 >> 1) + r13] = 3;
              r68 = ((r2 << 4) + r12 + 4 | 0) >> 1;
              HEAP16[r68] = 0;
              HEAP16[r68 + 1] = 0;
              HEAP16[r68 + 2] = 0;
              HEAP16[r68 + 3] = 0;
              HEAP16[r68 + 4] = 0;
              HEAP16[r68 + 5] = 0;
              HEAP16[r101 >> 1] = (r36 - r96 | 0) >>> 4 & 65535;
              r89 = 1;
              r90 = r37;
              r91 = r34;
              r92 = r36;
              r93 = r2 + 1 | 0;
              break;
            } else if (r6 == 202) {
              r6 = 0;
              HEAP8[r98] = HEAP8[r98] + 3 & 255;
              r89 = r99;
              r90 = r100;
              r91 = r95;
              r92 = r96;
              r93 = r2;
              break;
            }
          }
        } while (0);
        r25 = (r92 - r22 | 0) >>> 4;
        r28 = r32;
        r38 = Math.imul(HEAPU16[r16] + (r90 & 65535) | 0, r87) + r31 | 0;
        r58 = Math.imul(r89, r87);
        r55 = r29;
        while (1) {
          if ((r38 + r58 ^ r38) >>> 0 > 16777215) {
            if (r58 >>> 0 > 65535) {
              break;
            }
            r116 = -r38 & 65535;
          } else {
            r116 = r58;
          }
          r41 = r55 << 8;
          if (r28 >>> 0 < r5 >>> 0) {
            r117 = r28 + 1 | 0;
            r118 = HEAPU8[r28] | r41;
          } else {
            r117 = r28;
            r118 = r41;
          }
          r28 = r117;
          r38 = r38 << 8;
          r58 = r116 << 8;
          r55 = r118;
        }
        r41 = r25 & 65535;
        r52 = HEAP16[r17] + 3 & 65535;
        HEAP16[r17] = r52;
        if (!(r89 >>> 0 > 250 | (r52 & 65535) > 65280)) {
          r78 = r28;
          r79 = r38;
          r80 = r41;
          r81 = r91;
          r82 = r93;
          r83 = r58;
          r84 = r55;
          r85 = r33;
          break;
        }
        r52 = HEAP16[r15];
        if (r52 << 16 >> 16 == 0) {
          r119 = 0;
        } else {
          r119 = _enet_symbol_rescale(((r52 & 65535) << 4) + r14 | 0);
        }
        HEAP16[r17] = r119;
        r52 = HEAP16[r16];
        r39 = r52 - ((r52 & 65535) >>> 1) & 65535;
        HEAP16[r16] = r39;
        HEAP16[r17] = (HEAP16[r17] + 256 & 65535) + r39 & 65535;
        r78 = r28;
        r79 = r38;
        r80 = r41;
        r81 = r91;
        r82 = r93;
        r83 = r58;
        r84 = r55;
        r85 = r33;
      }
    } while (0);
    r41 = HEAP16[r9];
    L277 : do {
      if (r41 << 16 >> 16 == r85 << 16 >> 16) {
        r120 = r82;
        r121 = r8;
      } else {
        r39 = r82;
        r52 = r8;
        r35 = r41;
        while (1) {
          r53 = r35 & 65535;
          r36 = ((r53 << 4) + r12 + 8 | 0) >> 1;
          r34 = HEAP16[r36];
          do {
            if (r34 << 16 >> 16 == 0) {
              r68 = (r39 << 4) + r12 | 0;
              HEAP8[r68 | 0] = r81;
              HEAP8[(r39 << 4) + r12 + 1 | 0] = 2;
              HEAP16[((r39 << 4) + 2 >> 1) + r13] = 2;
              r71 = ((r39 << 4) + r12 + 4 | 0) >> 1;
              HEAP16[r71] = 0;
              HEAP16[r71 + 1] = 0;
              HEAP16[r71 + 2] = 0;
              HEAP16[r71 + 3] = 0;
              HEAP16[r71 + 4] = 0;
              HEAP16[r71 + 5] = 0;
              HEAP16[r36] = (r68 - ((r53 << 4) + r12) | 0) >>> 4 & 65535;
              r122 = 0;
              r123 = r68;
              r124 = r39 + 1 | 0;
            } else {
              r68 = ((r34 & 65535) + r53 << 4) + r12 | 0;
              L283 : while (1) {
                r71 = HEAP8[r68 | 0];
                L285 : do {
                  if ((r81 & 255) < (r71 & 255)) {
                    r125 = r68;
                    while (1) {
                      r62 = r125 + 2 | 0;
                      HEAP16[r62 >> 1] = HEAP16[r62 >> 1] + 2 & 65535;
                      r126 = r125 + 4 | 0;
                      r62 = HEAP16[r126 >> 1];
                      if (r62 << 16 >> 16 == 0) {
                        r6 = 221;
                        break L283;
                      }
                      r72 = ((r62 & 65535) << 4) + r125 | 0;
                      r62 = HEAP8[r72 | 0];
                      if ((r81 & 255) < (r62 & 255)) {
                        r125 = r72;
                      } else {
                        r127 = r72;
                        r128 = r62;
                        break L285;
                      }
                    }
                  } else {
                    r127 = r68;
                    r128 = r71;
                  }
                } while (0);
                if ((r81 & 255) <= (r128 & 255)) {
                  r6 = 226;
                  break;
                }
                r129 = r127 + 6 | 0;
                r71 = HEAP16[r129 >> 1];
                if (r71 << 16 >> 16 == 0) {
                  r6 = 225;
                  break;
                }
                r68 = ((r71 & 65535) << 4) + r127 | 0;
              }
              if (r6 == 221) {
                r6 = 0;
                r68 = (r39 << 4) + r12 | 0;
                HEAP8[r68 | 0] = r81;
                HEAP8[(r39 << 4) + r12 + 1 | 0] = 2;
                HEAP16[((r39 << 4) + 2 >> 1) + r13] = 2;
                r71 = ((r39 << 4) + r12 + 4 | 0) >> 1;
                HEAP16[r71] = 0;
                HEAP16[r71 + 1] = 0;
                HEAP16[r71 + 2] = 0;
                HEAP16[r71 + 3] = 0;
                HEAP16[r71 + 4] = 0;
                HEAP16[r71 + 5] = 0;
                HEAP16[r126 >> 1] = (r68 - r125 | 0) >>> 4 & 65535;
                r122 = 0;
                r123 = r68;
                r124 = r39 + 1 | 0;
                break;
              } else if (r6 == 225) {
                r6 = 0;
                r68 = (r39 << 4) + r12 | 0;
                HEAP8[r68 | 0] = r81;
                HEAP8[(r39 << 4) + r12 + 1 | 0] = 2;
                HEAP16[((r39 << 4) + 2 >> 1) + r13] = 2;
                r71 = ((r39 << 4) + r12 + 4 | 0) >> 1;
                HEAP16[r71] = 0;
                HEAP16[r71 + 1] = 0;
                HEAP16[r71 + 2] = 0;
                HEAP16[r71 + 3] = 0;
                HEAP16[r71 + 4] = 0;
                HEAP16[r71 + 5] = 0;
                HEAP16[r129 >> 1] = (r68 - r127 | 0) >>> 4 & 65535;
                r122 = 0;
                r123 = r68;
                r124 = r39 + 1 | 0;
                break;
              } else if (r6 == 226) {
                r6 = 0;
                r68 = r127 + 1 | 0;
                r71 = HEAPU8[r68];
                r62 = r127 + 2 | 0;
                HEAP16[r62 >> 1] = HEAP16[r62 >> 1] + 2 & 65535;
                HEAP8[r68] = HEAP8[r68] + 2 & 255;
                r122 = r71;
                r123 = r127;
                r124 = r39;
                break;
              }
            }
          } while (0);
          HEAP16[r52 >> 1] = (r123 - r21 | 0) >>> 4 & 65535;
          r34 = r123 + 14 | 0;
          if ((r122 | 0) == 0) {
            r37 = (r53 << 4) + r12 + 10 | 0;
            HEAP16[r37 >> 1] = HEAP16[r37 >> 1] + 5 & 65535;
            r37 = (r53 << 4) + r12 + 12 | 0;
            HEAP16[r37 >> 1] = HEAP16[r37 >> 1] + 5 & 65535;
          }
          r37 = ((r53 << 4) + r12 + 12 | 0) >> 1;
          r71 = HEAP16[r37] + 2 & 65535;
          HEAP16[r37] = r71;
          if (r122 >>> 0 > 251 | (r71 & 65535) > 65280) {
            r71 = HEAP16[r36];
            if (r71 << 16 >> 16 == 0) {
              r130 = 0;
            } else {
              r130 = _enet_symbol_rescale(((r71 & 65535) + r53 << 4) + r12 | 0);
            }
            HEAP16[r37] = r130;
            r71 = (r53 << 4) + r12 + 10 | 0;
            r68 = HEAP16[r71 >> 1];
            r62 = r68 - ((r68 & 65535) >>> 1) & 65535;
            HEAP16[r71 >> 1] = r62;
            HEAP16[r37] = r62 + HEAP16[r37] & 65535;
          }
          r37 = HEAP16[((r53 << 4) + 14 >> 1) + r13];
          if (r37 << 16 >> 16 == r85 << 16 >> 16) {
            r120 = r124;
            r121 = r34;
            break L277;
          } else {
            r39 = r124;
            r52 = r34;
            r35 = r37;
          }
        }
      }
    } while (0);
    HEAP16[r121 >> 1] = r80;
    if (r24 >>> 0 >= r10 >>> 0) {
      r11 = 0;
      r6 = 246;
      break;
    }
    r41 = r24 + 1 | 0;
    HEAP8[r24] = r81;
    if (r3 >>> 0 > 1) {
      HEAP16[r9] = HEAP16[((HEAPU16[r9] << 4) + 14 >> 1) + r13];
      r131 = r3;
    } else {
      r131 = r3 + 1 | 0;
    }
    if (r120 >>> 0 <= 4093) {
      r19 = r78;
      r24 = r41;
      r18 = r79;
      r2 = r120;
      r3 = r131;
      r26 = r83;
      r27 = r84;
      continue;
    }
    _memset(r1, 0, 16);
    HEAP16[r16] = 1;
    HEAP16[r17] = 257;
    HEAP16[r15] = 0;
    HEAP16[r9] = 0;
    r19 = r78;
    r24 = r41;
    r18 = r79;
    r2 = 1;
    r3 = 0;
    r26 = r83;
    r27 = r84;
  }
  if (r6 == 186) {
    r84 = r32;
    r32 = r31;
    r31 = Math.imul(r88, r87);
    while (1) {
      if ((r32 + r31 ^ r32) >>> 0 > 16777215) {
        if (r31 >>> 0 > 65535) {
          break;
        }
        r132 = -r32 & 65535;
      } else {
        r132 = r31;
      }
      r84 = r84 >>> 0 < r5 >>> 0 ? r84 + 1 | 0 : r84;
      r32 = r32 << 8;
      r31 = r132 << 8;
    }
    r11 = r24 - r4 | 0;
    STACKTOP = r7;
    return r11;
  } else if (r6 == 242) {
    STACKTOP = r7;
    return r11;
  } else if (r6 == 243) {
    STACKTOP = r7;
    return r11;
  } else if (r6 == 244) {
    STACKTOP = r7;
    return r11;
  } else if (r6 == 246) {
    STACKTOP = r7;
    return r11;
  }
}
function _enet_host_compress_with_range_coder(r1) {
  var r2, r3, r4, r5, r6;
  r2 = STACKTOP;
  STACKTOP = STACKTOP + 16 | 0;
  r3 = r2, r4 = r3 >> 2;
  r5 = r3 >> 2;
  HEAP32[r5] = 0;
  HEAP32[r5 + 1] = 0;
  HEAP32[r5 + 2] = 0;
  HEAP32[r5 + 3] = 0;
  r5 = _enet_range_coder_create();
  HEAP32[r4] = r5;
  if ((r5 | 0) == 0) {
    r6 = -1;
    STACKTOP = r2;
    return r6;
  }
  HEAP32[r4 + 1] = 16;
  HEAP32[r4 + 2] = 28;
  HEAP32[r4 + 3] = 12;
  _enet_host_compress(r1, r3);
  r6 = 0;
  STACKTOP = r2;
  return r6;
}
function _enet_host_channel_limit(r1, r2) {
  var r3, r4;
  r3 = (r2 | 0) == 0;
  if (r3 | r2 >>> 0 > 255) {
    r4 = 255;
  } else {
    r4 = r3 ? 1 : r2;
  }
  HEAP32[r1 + 44 >> 2] = r4;
  return;
}
function _enet_host_bandwidth_limit(r1, r2, r3) {
  HEAP32[r1 + 12 >> 2] = r2;
  HEAP32[r1 + 16 >> 2] = r3;
  HEAP32[r1 + 32 >> 2] = 1;
  return;
}
function _enet_list_clear(r1) {
  var r2;
  r2 = r1 | 0;
  HEAP32[r1 >> 2] = r2;
  HEAP32[r1 + 4 >> 2] = r2;
  return;
}
function _enet_list_insert(r1, r2) {
  var r3, r4, r5;
  r3 = r2;
  r4 = r1 + 4 | 0;
  r5 = r2 + 4 | 0;
  HEAP32[r5 >> 2] = HEAP32[r4 >> 2];
  HEAP32[r2 >> 2] = r1;
  HEAP32[HEAP32[r5 >> 2] >> 2] = r3;
  HEAP32[r4 >> 2] = r3;
  return r3;
}
function _enet_list_remove(r1) {
  var r2, r3;
  r2 = r1 | 0;
  r3 = r1 + 4 | 0;
  HEAP32[HEAP32[r3 >> 2] >> 2] = HEAP32[r2 >> 2];
  HEAP32[HEAP32[r2 >> 2] + 4 >> 2] = HEAP32[r3 >> 2];
  return r1;
}
function _enet_list_move(r1, r2, r3) {
  var r4, r5, r6;
  r4 = r2;
  r5 = r3 >> 2;
  r6 = (r2 + 4 | 0) >> 2;
  HEAP32[HEAP32[r6] >> 2] = HEAP32[r5];
  HEAP32[HEAP32[r5] + 4 >> 2] = HEAP32[r6];
  r2 = r1 + 4 | 0;
  HEAP32[r6] = HEAP32[r2 >> 2];
  HEAP32[r5] = r1;
  HEAP32[HEAP32[r6] >> 2] = r4;
  HEAP32[r2 >> 2] = r3;
  return r4;
}
function _enet_list_size(r1) {
  var r2, r3, r4, r5, r6;
  r2 = r1 | 0;
  r3 = HEAP32[r1 >> 2];
  if ((r3 | 0) == (r2 | 0)) {
    r4 = 0;
    return r4;
  } else {
    r5 = 0;
    r6 = r3;
  }
  while (1) {
    r3 = r5 + 1 | 0;
    r1 = HEAP32[r6 >> 2];
    if ((r1 | 0) == (r2 | 0)) {
      r4 = r3;
      break;
    } else {
      r5 = r3;
      r6 = r1;
    }
  }
  return r4;
}
function _enet_host_create(r1, r2, r3, r4, r5) {
  var r6, r7, r8, r9, r10, r11, r12, r13, r14, r15, r16;
  if (r2 >>> 0 > 4095) {
    r6 = 0;
    return r6;
  }
  r7 = _enet_malloc(10380);
  r8 = r7;
  if ((r7 | 0) == 0) {
    r6 = 0;
    return r6;
  }
  _memset(r7, 0, 10380);
  r9 = r2 * 380 & -1;
  r10 = _enet_malloc(r9);
  r11 = (r7 + 36 | 0) >> 2;
  HEAP32[r11] = r10;
  if ((r10 | 0) == 0) {
    _enet_free(r7);
    r6 = 0;
    return r6;
  }
  _memset(r10, 0, r9);
  r9 = _enet_socket_create(2);
  r10 = r7 >> 2;
  HEAP32[r10] = r9;
  L358 : do {
    if ((r9 | 0) != -1) {
      do {
        if ((r1 | 0) == 0) {
          _enet_socket_set_option(r9, 1, 1);
          _enet_socket_set_option(HEAP32[r10], 2, 1);
          _enet_socket_set_option(HEAP32[r10], 3, 262144);
          _enet_socket_set_option(HEAP32[r10], 4, 262144);
        } else {
          r12 = (_enet_socket_bind(r9, r1) | 0) < 0;
          r13 = HEAP32[r10];
          if (!r12) {
            _enet_socket_set_option(r13, 1, 1);
            _enet_socket_set_option(HEAP32[r10], 2, 1);
            _enet_socket_set_option(HEAP32[r10], 3, 262144);
            _enet_socket_set_option(HEAP32[r10], 4, 262144);
            r12 = r1;
            r14 = r7 + 4 | 0;
            r15 = HEAP32[r12 + 4 >> 2];
            HEAP32[r14 >> 2] = HEAP32[r12 >> 2];
            HEAP32[r14 + 4 >> 2] = r15;
            break;
          }
          if ((r13 | 0) == -1) {
            break L358;
          }
          _enet_socket_destroy(r13);
          break L358;
        }
      } while (0);
      r13 = (r3 | 0) == 0;
      if (r13 | r3 >>> 0 > 255) {
        r16 = 255;
      } else {
        r16 = r13 ? 1 : r3;
      }
      r13 = _time(0) + r7 | 0;
      HEAP32[r7 + 28 >> 2] = r13 << 16 | r13 >>> 16;
      HEAP32[r7 + 44 >> 2] = r16;
      HEAP32[r7 + 12 >> 2] = r4;
      HEAP32[r7 + 16 >> 2] = r5;
      HEAP32[r7 + 20 >> 2] = 0;
      HEAP32[r7 + 32 >> 2] = 0;
      HEAP32[r7 + 24 >> 2] = 1400;
      r13 = (r7 + 40 | 0) >> 2;
      HEAP32[r13] = r2;
      HEAP32[r7 + 1608 >> 2] = 0;
      r15 = (r7 + 2132 | 0) >> 2;
      HEAP32[r7 + 10348 >> 2] = 0;
      HEAP16[r7 + 10352 >> 1] = 0;
      r14 = (r7 + 10356 | 0) >> 2;
      HEAP32[r15] = 0;
      HEAP32[r15 + 1] = 0;
      HEAP32[r15 + 2] = 0;
      HEAP32[r15 + 3] = 0;
      HEAP32[r15 + 4] = 0;
      HEAP32[r15 + 5] = 0;
      HEAP32[r14] = 0;
      HEAP32[r14 + 1] = 0;
      HEAP32[r14 + 2] = 0;
      HEAP32[r14 + 3] = 0;
      HEAP32[r14 + 4] = 0;
      HEAP32[r14 + 5] = 0;
      _enet_list_clear(r7 + 52 | 0);
      if ((HEAP32[r13] | 0) <= 0) {
        r6 = r8;
        return r6;
      }
      r14 = HEAP32[r11];
      while (1) {
        HEAP32[r14 + 8 >> 2] = r8;
        HEAP16[r14 + 14 >> 1] = (r14 - HEAP32[r11] | 0) / 380 & -1 & 65535;
        HEAP8[r14 + 21 | 0] = -1;
        HEAP8[r14 + 20 | 0] = -1;
        HEAP32[r14 + 32 >> 2] = 0;
        _enet_list_clear(r14 + 192 | 0);
        _enet_list_clear(r14 + 200 | 0);
        _enet_list_clear(r14 + 208 | 0);
        _enet_list_clear(r14 + 216 | 0);
        _enet_list_clear(r14 + 224 | 0);
        _enet_list_clear(r14 + 232 | 0);
        _enet_peer_reset(r14);
        r15 = r14 + 380 | 0;
        if (r15 >>> 0 < (HEAP32[r11] + (HEAP32[r13] * 380 & -1) | 0) >>> 0) {
          r14 = r15;
        } else {
          r6 = r8;
          break;
        }
      }
      return r6;
    }
  } while (0);
  _enet_free(HEAP32[r11]);
  _enet_free(r7);
  r6 = 0;
  return r6;
}
function _enet_host_destroy(r1) {
  var r2, r3, r4, r5;
  _enet_socket_destroy(HEAP32[r1 >> 2]);
  r2 = (r1 + 36 | 0) >> 2;
  r3 = r1 + 40 | 0;
  L380 : do {
    if ((HEAP32[r3 >> 2] | 0) > 0) {
      r4 = HEAP32[r2];
      while (1) {
        _enet_peer_reset(r4);
        r5 = r4 + 380 | 0;
        if (r5 >>> 0 < (HEAP32[r2] + (HEAP32[r3 >> 2] * 380 & -1) | 0) >>> 0) {
          r4 = r5;
        } else {
          break L380;
        }
      }
    }
  } while (0);
  r3 = HEAP32[r1 + 2140 >> 2];
  do {
    if ((r3 | 0) != 0) {
      r4 = HEAP32[r1 + 2152 >> 2];
      if ((r4 | 0) == 0) {
        break;
      }
      FUNCTION_TABLE[r4](r3);
    }
  } while (0);
  _enet_free(HEAP32[r2]);
  _enet_free(r1);
  return;
}
function _enet_host_connect(r1, r2, r3, r4) {
  var r5, r6, r7, r8, r9, r10, r11, r12, r13, r14;
  r5 = STACKTOP;
  STACKTOP = STACKTOP + 48 | 0;
  r6 = r5;
  if ((r3 | 0) == 0) {
    r7 = 1;
  } else {
    r7 = r3 >>> 0 > 255 ? 255 : r3;
  }
  r3 = r1 + 36 | 0;
  r8 = HEAP32[r3 >> 2];
  r9 = r1 + 40 | 0;
  r10 = r8 + (HEAP32[r9 >> 2] * 380 & -1) | 0;
  r11 = r8;
  while (1) {
    if (r11 >>> 0 >= r10 >>> 0) {
      break;
    }
    if ((HEAP32[r11 + 36 >> 2] | 0) == 0) {
      break;
    } else {
      r11 = r11 + 380 | 0;
    }
  }
  if (r11 >>> 0 >= (HEAP32[r3 >> 2] + (HEAP32[r9 >> 2] * 380 & -1) | 0) >>> 0) {
    r12 = 0;
    STACKTOP = r5;
    return r12;
  }
  r9 = _enet_malloc(r7 * 60 & -1);
  r3 = (r11 + 40 | 0) >> 2;
  HEAP32[r3] = r9;
  if ((r9 | 0) == 0) {
    r12 = 0;
    STACKTOP = r5;
    return r12;
  }
  HEAP32[r11 + 44 >> 2] = r7;
  HEAP32[r11 + 36 >> 2] = 1;
  r9 = r2;
  r2 = r11 + 24 | 0;
  r10 = HEAP32[r9 + 4 >> 2];
  HEAP32[r2 >> 2] = HEAP32[r9 >> 2];
  HEAP32[r2 + 4 >> 2] = r10;
  r10 = r1 + 28 | 0;
  r2 = HEAP32[r10 >> 2] + 1 | 0;
  HEAP32[r10 >> 2] = r2;
  r10 = r11 + 16 | 0;
  HEAP32[r10 >> 2] = r2;
  r2 = r1 + 16 | 0;
  r9 = HEAP32[r2 >> 2];
  if ((r9 | 0) == 0) {
    HEAP32[r11 + 180 >> 2] = 32768;
  } else {
    HEAP32[r11 + 180 >> 2] = r9 >>> 16 << 12;
  }
  r9 = (r11 + 180 | 0) >> 2;
  r8 = HEAP32[r9];
  do {
    if (r8 >>> 0 < 4096) {
      HEAP32[r9] = 4096;
    } else {
      if (r8 >>> 0 <= 32768) {
        break;
      }
      HEAP32[r9] = 32768;
    }
  } while (0);
  L412 : do {
    if ((r7 | 0) > 0) {
      r8 = HEAP32[r3], r13 = r8 >> 1;
      while (1) {
        HEAP16[r13] = 0;
        HEAP16[r13 + 1] = 0;
        HEAP16[r13 + 19] = 0;
        HEAP16[r13 + 20] = 0;
        _enet_list_clear(r8 + 44 | 0);
        _enet_list_clear(r8 + 52 | 0);
        r14 = r8 + 60 | 0;
        _memset(r8 + 4 | 0, 0, 34);
        if (r14 >>> 0 < (HEAP32[r3] + (r7 * 60 & -1) | 0) >>> 0) {
          r8 = r14, r13 = r8 >> 1;
        } else {
          break L412;
        }
      }
    }
  } while (0);
  HEAP8[r6 | 0] = -126;
  HEAP8[r6 + 1 | 0] = -1;
  r3 = r6 + 4 | 0;
  tempBigInt = _htons(HEAP16[r11 + 14 >> 1]);
  HEAP8[r3] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r3 + 1 | 0] = tempBigInt & 255;
  HEAP8[r6 + 6 | 0] = HEAP8[r11 + 21 | 0];
  HEAP8[r6 + 7 | 0] = HEAP8[r11 + 20 | 0];
  r3 = r6 + 8 | 0;
  tempBigInt = _htonl(HEAP32[r11 + 176 >> 2]);
  HEAP8[r3] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r3 + 1 | 0] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r3 + 2 | 0] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r3 + 3 | 0] = tempBigInt & 255;
  r3 = r6 + 12 | 0;
  tempBigInt = _htonl(HEAP32[r9]);
  HEAP8[r3] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r3 + 1 | 0] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r3 + 2 | 0] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r3 + 3 | 0] = tempBigInt & 255;
  r3 = r6 + 16 | 0;
  tempBigInt = _htonl(r7);
  HEAP8[r3] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r3 + 1 | 0] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r3 + 2 | 0] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r3 + 3 | 0] = tempBigInt & 255;
  r3 = r6 + 20 | 0;
  tempBigInt = _htonl(HEAP32[r1 + 12 >> 2]);
  HEAP8[r3] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r3 + 1 | 0] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r3 + 2 | 0] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r3 + 3 | 0] = tempBigInt & 255;
  r3 = r6 + 24 | 0;
  tempBigInt = _htonl(HEAP32[r2 >> 2]);
  HEAP8[r3] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r3 + 1 | 0] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r3 + 2 | 0] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r3 + 3 | 0] = tempBigInt & 255;
  r3 = r6 + 28 | 0;
  tempBigInt = _htonl(HEAP32[r11 + 132 >> 2]);
  HEAP8[r3] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r3 + 1 | 0] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r3 + 2 | 0] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r3 + 3 | 0] = tempBigInt & 255;
  r3 = r6 + 32 | 0;
  tempBigInt = _htonl(HEAP32[r11 + 124 >> 2]);
  HEAP8[r3] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r3 + 1 | 0] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r3 + 2 | 0] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r3 + 3 | 0] = tempBigInt & 255;
  r3 = r6 + 36 | 0;
  tempBigInt = _htonl(HEAP32[r11 + 128 >> 2]);
  HEAP8[r3] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r3 + 1 | 0] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r3 + 2 | 0] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r3 + 3 | 0] = tempBigInt & 255;
  r3 = r6 + 40 | 0;
  tempBigInt = HEAP32[r10 >> 2];
  HEAP8[r3] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r3 + 1 | 0] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r3 + 2 | 0] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r3 + 3 | 0] = tempBigInt & 255;
  r3 = r6 + 44 | 0;
  tempBigInt = _htonl(r4);
  HEAP8[r3] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r3 + 1 | 0] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r3 + 2 | 0] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r3 + 3 | 0] = tempBigInt & 255;
  _enet_peer_queue_outgoing_command(r11, r6, 0, 0, 0);
  r12 = r11;
  STACKTOP = r5;
  return r12;
}
function _enet_host_broadcast(r1, r2, r3) {
  var r4, r5, r6;
  r4 = r1 + 36 | 0;
  r5 = r1 + 40 | 0;
  L419 : do {
    if ((HEAP32[r5 >> 2] | 0) > 0) {
      r1 = HEAP32[r4 >> 2];
      while (1) {
        if ((HEAP32[r1 + 36 >> 2] | 0) == 5) {
          _enet_peer_send(r1, r2, r3);
        }
        r6 = r1 + 380 | 0;
        if (r6 >>> 0 < (HEAP32[r4 >> 2] + (HEAP32[r5 >> 2] * 380 & -1) | 0) >>> 0) {
          r1 = r6;
        } else {
          break L419;
        }
      }
    }
  } while (0);
  if ((HEAP32[r3 >> 2] | 0) != 0) {
    return;
  }
  _enet_packet_destroy(r3);
  return;
}
function _enet_host_compress(r1, r2) {
  var r3, r4, r5, r6;
  r3 = r1 + 2140 | 0;
  r4 = r3 | 0;
  r5 = HEAP32[r4 >> 2];
  do {
    if ((r5 | 0) != 0) {
      r6 = HEAP32[r1 + 2152 >> 2];
      if ((r6 | 0) == 0) {
        break;
      }
      FUNCTION_TABLE[r6](r5);
    }
  } while (0);
  if ((r2 | 0) == 0) {
    HEAP32[r4 >> 2] = 0;
    return;
  } else {
    r4 = r3 >> 2;
    r3 = r2 >> 2;
    HEAP32[r4] = HEAP32[r3];
    HEAP32[r4 + 1] = HEAP32[r3 + 1];
    HEAP32[r4 + 2] = HEAP32[r3 + 2];
    HEAP32[r4 + 3] = HEAP32[r3 + 3];
    return;
  }
}
function _enet_host_bandwidth_throttle(r1) {
  var r2, r3, r4, r5, r6, r7, r8, r9, r10, r11, r12, r13, r14, r15, r16, r17, r18, r19, r20, r21, r22, r23, r24, r25, r26, r27, r28, r29, r30, r31, r32, r33, r34, r35, r36;
  r2 = 0;
  r3 = STACKTOP;
  STACKTOP = STACKTOP + 48 | 0;
  r4 = r3;
  r5 = _enet_time_get();
  r6 = r1 + 20 | 0;
  r7 = r5 - HEAP32[r6 >> 2] | 0;
  if (r7 >>> 0 < 1e3) {
    STACKTOP = r3;
    return;
  }
  r8 = (r1 + 36 | 0) >> 2;
  r9 = (r1 + 40 | 0) >> 2;
  if ((HEAP32[r9] | 0) <= 0) {
    STACKTOP = r3;
    return;
  }
  r10 = HEAP32[r8];
  r11 = r10 + (HEAP32[r9] * 380 & -1) | 0;
  r12 = 0;
  r13 = r10;
  r10 = 0;
  while (1) {
    if ((HEAP32[r13 + 36 >> 2] - 5 | 0) >>> 0 < 2) {
      r14 = r10 + 1 | 0;
      r15 = HEAP32[r13 + 68 >> 2] + r12 | 0;
    } else {
      r14 = r10;
      r15 = r12;
    }
    r16 = r13 + 380 | 0;
    if (r16 >>> 0 < r11 >>> 0) {
      r12 = r15;
      r13 = r16;
      r10 = r14;
    } else {
      break;
    }
  }
  if ((r14 | 0) == 0) {
    STACKTOP = r3;
    return;
  }
  r10 = r1 + 16 | 0;
  r13 = HEAP32[r10 >> 2];
  if ((r13 | 0) == 0) {
    r17 = -1;
  } else {
    r17 = Math.floor((Math.imul(r13, r7) >>> 0) / 1e3);
  }
  L460 : do {
    if ((r14 | 0) != 0) {
      r13 = r15;
      r12 = r14;
      r11 = r17;
      while (1) {
        if (r13 >>> 0 < r11 >>> 0) {
          r18 = 32;
        } else {
          r18 = Math.floor((r11 << 5 >>> 0) / (r13 >>> 0));
        }
        if ((HEAP32[r9] | 0) <= 0) {
          r2 = 352;
          break;
        }
        r16 = r13;
        r19 = r12;
        r20 = r11;
        r21 = 0;
        r22 = HEAP32[r8], r23 = r22 >> 2;
        while (1) {
          do {
            if ((HEAP32[r23 + 9] - 5 | 0) >>> 0 < 2) {
              r24 = HEAP32[r23 + 12];
              if ((r24 | 0) == 0) {
                r25 = r21;
                r26 = r20;
                r27 = r19;
                r28 = r16;
                break;
              }
              r29 = r22 + 60 | 0;
              if ((HEAP32[r29 >> 2] | 0) == (r5 | 0)) {
                r25 = r21;
                r26 = r20;
                r27 = r19;
                r28 = r16;
                break;
              }
              r30 = Math.floor((Math.imul(r24, r7) >>> 0) / 1e3);
              r24 = HEAP32[r23 + 17];
              if (Math.imul(r24, r18) >>> 5 >>> 0 <= r30 >>> 0) {
                r25 = r21;
                r26 = r20;
                r27 = r19;
                r28 = r16;
                break;
              }
              r31 = Math.floor((r30 << 5 >>> 0) / (r24 >>> 0));
              r24 = (r31 | 0) == 0 ? 1 : r31;
              HEAP32[r23 + 28] = r24;
              r31 = r22 + 108 | 0;
              if (HEAP32[r31 >> 2] >>> 0 > r24 >>> 0) {
                HEAP32[r31 >> 2] = r24;
              }
              HEAP32[r29 >> 2] = r5;
              r25 = 1;
              r26 = r20 - r30 | 0;
              r27 = r19 - 1 | 0;
              r28 = r16 - r30 | 0;
            } else {
              r25 = r21;
              r26 = r20;
              r27 = r19;
              r28 = r16;
            }
          } while (0);
          r30 = r22 + 380 | 0;
          if (r30 >>> 0 < (HEAP32[r8] + (HEAP32[r9] * 380 & -1) | 0) >>> 0) {
            r16 = r28;
            r19 = r27;
            r20 = r26;
            r21 = r25;
            r22 = r30, r23 = r22 >> 2;
          } else {
            break;
          }
        }
        r32 = (r27 | 0) != 0;
        if ((r25 | 0) == 0 | r32 ^ 1) {
          r2 = 362;
          break;
        } else {
          r13 = r28;
          r12 = r27;
          r11 = r26;
        }
      }
      if (r2 == 352) {
        if ((r12 | 0) == 0) {
          break;
        }
      } else if (r2 == 362) {
        if (!r32) {
          break;
        }
      }
      if ((HEAP32[r9] | 0) <= 0) {
        break;
      }
      r11 = HEAP32[r8], r13 = r11 >> 2;
      while (1) {
        do {
          if ((HEAP32[r13 + 9] - 5 | 0) >>> 0 < 2) {
            if ((HEAP32[r13 + 15] | 0) == (r5 | 0)) {
              break;
            }
            HEAP32[r13 + 28] = r18;
            r22 = r11 + 108 | 0;
            if (HEAP32[r22 >> 2] >>> 0 <= r18 >>> 0) {
              break;
            }
            HEAP32[r22 >> 2] = r18;
          }
        } while (0);
        r22 = r11 + 380 | 0;
        if (r22 >>> 0 < (HEAP32[r8] + (HEAP32[r9] * 380 & -1) | 0) >>> 0) {
          r11 = r22, r13 = r11 >> 2;
        } else {
          break L460;
        }
      }
    }
  } while (0);
  r18 = r1 + 32 | 0;
  L492 : do {
    if ((HEAP32[r18 >> 2] | 0) != 0) {
      HEAP32[r18 >> 2] = 0;
      r32 = HEAP32[r1 + 12 >> 2];
      L494 : do {
        if ((r32 | 0) == 0 | (r14 | 0) == 0) {
          r33 = 0;
        } else {
          r2 = r14;
          r26 = r32;
          while (1) {
            r27 = Math.floor((r26 >>> 0) / (r2 >>> 0));
            if ((HEAP32[r9] | 0) <= 0) {
              break L492;
            }
            r28 = r2;
            r25 = r26;
            r7 = 0;
            r17 = HEAP32[r8];
            while (1) {
              do {
                if ((HEAP32[r17 + 36 >> 2] - 5 | 0) >>> 0 < 2) {
                  r15 = r17 + 56 | 0;
                  if ((HEAP32[r15 >> 2] | 0) == (r5 | 0)) {
                    r34 = r7;
                    r35 = r25;
                    r36 = r28;
                    break;
                  }
                  r11 = r17 + 52 | 0;
                  r13 = HEAP32[r11 >> 2];
                  if (!((r13 | 0) == 0 | r13 >>> 0 < r27 >>> 0)) {
                    r34 = r7;
                    r35 = r25;
                    r36 = r28;
                    break;
                  }
                  HEAP32[r15 >> 2] = r5;
                  r34 = 1;
                  r35 = r25 - HEAP32[r11 >> 2] | 0;
                  r36 = r28 - 1 | 0;
                } else {
                  r34 = r7;
                  r35 = r25;
                  r36 = r28;
                }
              } while (0);
              r11 = r17 + 380 | 0;
              if (r11 >>> 0 < (HEAP32[r8] + (HEAP32[r9] * 380 & -1) | 0) >>> 0) {
                r28 = r36;
                r25 = r35;
                r7 = r34;
                r17 = r11;
              } else {
                break;
              }
            }
            if ((r36 | 0) == 0 | (r34 | 0) == 0) {
              r33 = r27;
              break L494;
            } else {
              r2 = r36;
              r26 = r35;
            }
          }
        }
      } while (0);
      if ((HEAP32[r9] | 0) <= 0) {
        break;
      }
      r32 = r4 | 0;
      r26 = r4 + 1 | 0;
      r2 = r4 + 8 | 0;
      r17 = r4 + 4 | 0;
      r7 = r4 + 4 | 0;
      r25 = HEAP32[r8], r28 = r25 >> 2;
      while (1) {
        if ((HEAP32[r28 + 9] - 5 | 0) >>> 0 < 2) {
          HEAP8[r32] = -118;
          HEAP8[r26] = -1;
          tempBigInt = _htonl(HEAP32[r10 >> 2]);
          HEAP8[r2] = tempBigInt & 255;
          tempBigInt = tempBigInt >> 8;
          HEAP8[r2 + 1 | 0] = tempBigInt & 255;
          tempBigInt = tempBigInt >> 8;
          HEAP8[r2 + 2 | 0] = tempBigInt & 255;
          tempBigInt = tempBigInt >> 8;
          HEAP8[r2 + 3 | 0] = tempBigInt & 255;
          if ((HEAP32[r28 + 14] | 0) == (r5 | 0)) {
            tempBigInt = _htonl(HEAP32[r28 + 13]);
            HEAP8[r17] = tempBigInt & 255;
            tempBigInt = tempBigInt >> 8;
            HEAP8[r17 + 1 | 0] = tempBigInt & 255;
            tempBigInt = tempBigInt >> 8;
            HEAP8[r17 + 2 | 0] = tempBigInt & 255;
            tempBigInt = tempBigInt >> 8;
            HEAP8[r17 + 3 | 0] = tempBigInt & 255;
          } else {
            tempBigInt = _htonl(r33);
            HEAP8[r7] = tempBigInt & 255;
            tempBigInt = tempBigInt >> 8;
            HEAP8[r7 + 1 | 0] = tempBigInt & 255;
            tempBigInt = tempBigInt >> 8;
            HEAP8[r7 + 2 | 0] = tempBigInt & 255;
            tempBigInt = tempBigInt >> 8;
            HEAP8[r7 + 3 | 0] = tempBigInt & 255;
          }
          _enet_peer_queue_outgoing_command(r25, r4, 0, 0, 0);
        }
        r11 = r25 + 380 | 0;
        if (r11 >>> 0 < (HEAP32[r8] + (HEAP32[r9] * 380 & -1) | 0) >>> 0) {
          r25 = r11, r28 = r25 >> 2;
        } else {
          break L492;
        }
      }
    }
  } while (0);
  HEAP32[r6 >> 2] = r5;
  if ((HEAP32[r9] | 0) <= 0) {
    STACKTOP = r3;
    return;
  }
  r5 = HEAP32[r8];
  while (1) {
    HEAP32[r5 + 64 >> 2] = 0;
    HEAP32[r5 + 68 >> 2] = 0;
    r6 = r5 + 380 | 0;
    if (r6 >>> 0 < (HEAP32[r8] + (HEAP32[r9] * 380 & -1) | 0) >>> 0) {
      r5 = r6;
    } else {
      break;
    }
  }
  STACKTOP = r3;
  return;
}
function _reflect_crc(r1, r2) {
  var r3, r4, r5, r6, r7, r8;
  if ((r2 | 0) <= 0) {
    r3 = 0;
    return r3;
  }
  r4 = r2 - 1 | 0;
  r5 = r1;
  r1 = 0;
  r6 = 0;
  while (1) {
    if ((r5 & 1 | 0) == 0) {
      r7 = r1;
    } else {
      r7 = 1 << r4 - r6 | r1;
    }
    r8 = r6 + 1 | 0;
    if ((r8 | 0) == (r2 | 0)) {
      r3 = r7;
      break;
    } else {
      r5 = r5 >> 1;
      r1 = r7;
      r6 = r8;
    }
  }
  return r3;
}
function _enet_peer_throttle(r1, r2) {
  var r3, r4, r5, r6, r7, r8, r9;
  r3 = r1 >> 2;
  r4 = HEAP32[r3 + 38];
  r5 = HEAP32[r3 + 40];
  if (r4 >>> 0 <= r5 >>> 0) {
    HEAP32[r3 + 27] = HEAP32[r3 + 28];
    r6 = 0;
    return r6;
  }
  if (r4 >>> 0 > r2 >>> 0) {
    r7 = (r1 + 108 | 0) >> 2;
    r8 = HEAP32[r7] + HEAP32[r3 + 31] | 0;
    HEAP32[r7] = r8;
    r9 = HEAP32[r3 + 28];
    if (r8 >>> 0 <= r9 >>> 0) {
      r6 = 1;
      return r6;
    }
    HEAP32[r7] = r9;
    r6 = 1;
    return r6;
  } else {
    if (((r5 << 1) + r4 | 0) >>> 0 >= r2 >>> 0) {
      r6 = 0;
      return r6;
    }
    r2 = r1 + 108 | 0;
    r1 = HEAP32[r2 >> 2];
    r4 = HEAP32[r3 + 32];
    HEAP32[r2 >> 2] = r1 >>> 0 > r4 >>> 0 ? r1 - r4 | 0 : 0;
    r6 = -1;
    return r6;
  }
}
function _enet_packet_create(r1, r2, r3) {
  var r4, r5, r6, r7, r8;
  r4 = _enet_malloc(20), r5 = r4 >> 2;
  r6 = r4;
  if ((r4 | 0) == 0) {
    r7 = 0;
    return r7;
  }
  do {
    if ((r3 & 4 | 0) == 0) {
      if ((r2 | 0) == 0) {
        HEAP32[r5 + 2] = 0;
        break;
      }
      r8 = _enet_malloc(r2);
      HEAP32[r5 + 2] = r8;
      if ((r8 | 0) == 0) {
        _enet_free(r4);
        r7 = 0;
        return r7;
      } else {
        if ((r1 | 0) == 0) {
          break;
        }
        _memcpy(r8, r1, r2);
        break;
      }
    } else {
      HEAP32[r5 + 2] = r1;
    }
  } while (0);
  HEAP32[r5] = 0;
  HEAP32[r5 + 1] = r3;
  HEAP32[r5 + 3] = r2;
  HEAP32[r5 + 4] = 0;
  r7 = r6;
  return r7;
}
function _enet_packet_destroy(r1) {
  var r2;
  r2 = HEAP32[r1 + 16 >> 2];
  if ((r2 | 0) != 0) {
    FUNCTION_TABLE[r2](r1);
  }
  do {
    if ((HEAP32[r1 + 4 >> 2] & 4 | 0) == 0) {
      r2 = HEAP32[r1 + 8 >> 2];
      if ((r2 | 0) == 0) {
        break;
      }
      _enet_free(r2);
    }
  } while (0);
  _enet_free(r1);
  return;
}
function _enet_packet_resize(r1, r2) {
  var r3, r4, r5, r6;
  r3 = (r1 + 12 | 0) >> 2;
  do {
    if (HEAP32[r3] >>> 0 < r2 >>> 0) {
      if ((HEAP32[r1 + 4 >> 2] & 4 | 0) != 0) {
        break;
      }
      r4 = _enet_malloc(r2);
      if ((r4 | 0) == 0) {
        r5 = -1;
        return r5;
      }
      r6 = (r1 + 8 | 0) >> 2;
      _memcpy(r4, HEAP32[r6], HEAP32[r3]);
      _enet_free(HEAP32[r6]);
      HEAP32[r6] = r4;
      HEAP32[r3] = r2;
      r5 = 0;
      return r5;
    }
  } while (0);
  HEAP32[r3] = r2;
  r5 = 0;
  return r5;
}
function _enet_crc32(r1, r2) {
  var r3, r4, r5, r6, r7, r8, r9, r10, r11, r12, r13, r14, r15;
  if (!HEAP8[409860]) {
    _initialize_crc32();
  }
  if ((r2 | 0) == 0) {
    r3 = -1;
    r4 = r3 ^ -1;
    r5 = _htonl(r4);
    return r5;
  } else {
    r6 = -1;
    r7 = r1;
    r8 = r2;
  }
  while (1) {
    r2 = r8 - 1 | 0;
    r1 = HEAP32[r7 >> 2];
    r9 = HEAP32[r7 + 4 >> 2];
    r10 = r1 + r9 | 0;
    L593 : do {
      if ((r9 | 0) > 0) {
        r11 = r6;
        r12 = r1;
        while (1) {
          r13 = r12 + 1 | 0;
          r14 = HEAP32[((HEAPU8[r12] ^ r11 & 255) << 2) + 409992 >> 2] ^ r11 >>> 8;
          if (r13 >>> 0 < r10 >>> 0) {
            r11 = r14;
            r12 = r13;
          } else {
            r15 = r14;
            break L593;
          }
        }
      } else {
        r15 = r6;
      }
    } while (0);
    if ((r2 | 0) == 0) {
      r3 = r15;
      break;
    } else {
      r6 = r15;
      r7 = r7 + 8 | 0;
      r8 = r2;
    }
  }
  r4 = r3 ^ -1;
  r5 = _htonl(r4);
  return r5;
}
function _initialize_crc32() {
  var r1, r2, r3, r4;
  r1 = 0;
  while (1) {
    r2 = _reflect_crc(r1, 8);
    r3 = r2 << 25;
    r4 = (r2 & 128 | 0) != 0 ? r3 ^ 79764919 : r3;
    r3 = r4 << 1;
    r2 = (r4 | 0) < 0 ? r3 ^ 79764919 : r3;
    r3 = r2 << 1;
    r4 = (r2 | 0) < 0 ? r3 ^ 79764919 : r3;
    r3 = r4 << 1;
    r2 = (r4 | 0) < 0 ? r3 ^ 79764919 : r3;
    r3 = r2 << 1;
    r4 = (r2 | 0) < 0 ? r3 ^ 79764919 : r3;
    r3 = r4 << 1;
    r2 = (r4 | 0) < 0 ? r3 ^ 79764919 : r3;
    r3 = r2 << 1;
    r4 = (r2 | 0) < 0 ? r3 ^ 79764919 : r3;
    r3 = r4 << 1;
    HEAP32[(r1 << 2) + 409992 >> 2] = _reflect_crc((r4 | 0) < 0 ? r3 ^ 79764919 : r3, 32);
    r3 = r1 + 1 | 0;
    if ((r3 | 0) == 256) {
      break;
    } else {
      r1 = r3;
    }
  }
  HEAP8[409860] = 1;
  return;
}
function _enet_peer_throttle_configure(r1, r2, r3, r4) {
  var r5, r6, r7;
  r5 = STACKTOP;
  STACKTOP = STACKTOP + 48 | 0;
  r6 = r5;
  HEAP32[r1 + 132 >> 2] = r2;
  HEAP32[r1 + 124 >> 2] = r3;
  HEAP32[r1 + 128 >> 2] = r4;
  HEAP8[r6 | 0] = -117;
  HEAP8[r6 + 1 | 0] = -1;
  r7 = r6 + 4 | 0;
  tempBigInt = _htonl(r2);
  HEAP8[r7] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r7 + 1 | 0] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r7 + 2 | 0] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r7 + 3 | 0] = tempBigInt & 255;
  r7 = r6 + 8 | 0;
  tempBigInt = _htonl(r3);
  HEAP8[r7] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r7 + 1 | 0] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r7 + 2 | 0] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r7 + 3 | 0] = tempBigInt & 255;
  r7 = r6 + 12 | 0;
  tempBigInt = _htonl(r4);
  HEAP8[r7] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r7 + 1 | 0] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r7 + 2 | 0] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r7 + 3 | 0] = tempBigInt & 255;
  _enet_peer_queue_outgoing_command(r1, r6, 0, 0, 0);
  STACKTOP = r5;
  return;
}
function _enet_peer_queue_outgoing_command(r1, r2, r3, r4, r5) {
  var r6, r7, r8;
  r6 = _enet_malloc(84);
  r7 = r6;
  if ((r6 | 0) == 0) {
    r8 = 0;
    return r8;
  }
  _memcpy(r6 + 32 | 0, r2 | 0, 48);
  HEAP32[r6 + 24 >> 2] = r4;
  HEAP16[r6 + 28 >> 1] = r5;
  HEAP32[r6 + 80 >> 2] = r3;
  if ((r3 | 0) != 0) {
    r6 = r3 | 0;
    HEAP32[r6 >> 2] = HEAP32[r6 >> 2] + 1 | 0;
  }
  _enet_peer_setup_outgoing_command(r1, r7);
  r8 = r7;
  return r8;
}
function _enet_peer_send(r1, r2, r3) {
  var r4, r5, r6, r7, r8, r9, r10, r11, r12, r13, r14, r15, r16, r17, r18, r19, r20, r21, r22, r23, r24;
  r4 = r1 >> 2;
  r5 = 0;
  r6 = STACKTOP;
  STACKTOP = STACKTOP + 56 | 0;
  r7 = r6;
  r8 = r6 + 48;
  r9 = r2 & 255;
  r10 = HEAP32[r4 + 10] >> 1;
  if ((HEAP32[r4 + 9] | 0) != 5) {
    r11 = -1;
    STACKTOP = r6;
    return r11;
  }
  if (r9 >>> 0 >= HEAP32[r4 + 11] >>> 0) {
    r11 = -1;
    STACKTOP = r6;
    return r11;
  }
  r12 = (r3 + 12 | 0) >> 2;
  r13 = HEAP32[r12];
  if (r13 >>> 0 > 1073741824) {
    r11 = -1;
    STACKTOP = r6;
    return r11;
  }
  r14 = ((HEAP32[HEAP32[r4 + 2] + 2136 >> 2] | 0) == 0 ? -28 : -32) + HEAP32[r4 + 44] | 0;
  if (r13 >>> 0 <= r14 >>> 0) {
    HEAP8[r7 + 1 | 0] = r2;
    r4 = HEAP32[r3 + 4 >> 2];
    L623 : do {
      if ((r4 & 3 | 0) == 2) {
        HEAP8[r7 | 0] = 73;
        r15 = r7 + 6 | 0;
        tempBigInt = _htons(HEAP32[r12] & 65535);
        HEAP8[r15] = tempBigInt & 255;
        tempBigInt = tempBigInt >> 8;
        HEAP8[r15 + 1 | 0] = tempBigInt & 255;
      } else {
        do {
          if ((r4 & 1 | 0) == 0) {
            if (HEAP16[((r9 * 60 & -1) + 2 >> 1) + r10] << 16 >> 16 == -1) {
              break;
            }
            HEAP8[r7 | 0] = 7;
            r15 = r7 + 6 | 0;
            tempBigInt = _htons(HEAP32[r12] & 65535);
            HEAP8[r15] = tempBigInt & 255;
            tempBigInt = tempBigInt >> 8;
            HEAP8[r15 + 1 | 0] = tempBigInt & 255;
            break L623;
          }
        } while (0);
        HEAP8[r7 | 0] = -122;
        r15 = r7 + 4 | 0;
        tempBigInt = _htons(HEAP32[r12] & 65535);
        HEAP8[r15] = tempBigInt & 255;
        tempBigInt = tempBigInt >> 8;
        HEAP8[r15 + 1 | 0] = tempBigInt & 255;
      }
    } while (0);
    r11 = ((_enet_peer_queue_outgoing_command(r1, r7, r3, 0, HEAP32[r12] & 65535) | 0) == 0) << 31 >> 31;
    STACKTOP = r6;
    return r11;
  }
  r7 = Math.floor(((r13 - 1 + r14 | 0) >>> 0) / (r14 >>> 0));
  if (r7 >>> 0 > 1048576) {
    r11 = -1;
    STACKTOP = r6;
    return r11;
  }
  do {
    if ((HEAP32[r3 + 4 >> 2] & 9 | 0) == 8) {
      r13 = HEAP16[((r9 * 60 & -1) + 2 >> 1) + r10];
      if (r13 << 16 >> 16 == -1) {
        r5 = 474;
        break;
      } else {
        r16 = 12;
        r17 = r13;
        break;
      }
    } else {
      r5 = 474;
    }
  } while (0);
  if (r5 == 474) {
    r16 = -120;
    r17 = HEAP16[((r9 * 60 & -1) >> 1) + r10];
  }
  r10 = _htons(r17 + 1 & 65535);
  _enet_list_clear(r8);
  r17 = HEAP32[r12];
  L641 : do {
    if ((r17 | 0) == 0) {
      r18 = 0;
    } else {
      r9 = r8 | 0;
      r5 = r14;
      r13 = 0;
      r4 = 0;
      r15 = r17;
      while (1) {
        r19 = r15 - r4 | 0;
        r20 = r19 >>> 0 < r5 >>> 0 ? r19 : r5;
        r19 = _enet_malloc(84);
        if ((r19 | 0) == 0) {
          break;
        }
        HEAP32[r19 + 24 >> 2] = r4;
        r21 = r20 & 65535;
        HEAP16[r19 + 28 >> 1] = r21;
        HEAP32[r19 + 80 >> 2] = r3;
        HEAP8[r19 + 32 | 0] = r16;
        HEAP8[r19 + 33 | 0] = r2;
        r22 = r19 + 36 | 0;
        tempBigInt = r10;
        HEAP8[r22] = tempBigInt & 255;
        tempBigInt = tempBigInt >> 8;
        HEAP8[r22 + 1 | 0] = tempBigInt & 255;
        r22 = r19 + 38 | 0;
        tempBigInt = _htons(r21);
        HEAP8[r22] = tempBigInt & 255;
        tempBigInt = tempBigInt >> 8;
        HEAP8[r22 + 1 | 0] = tempBigInt & 255;
        r22 = r19 + 40 | 0;
        tempBigInt = _htonl(r7);
        HEAP8[r22] = tempBigInt & 255;
        tempBigInt = tempBigInt >> 8;
        HEAP8[r22 + 1 | 0] = tempBigInt & 255;
        tempBigInt = tempBigInt >> 8;
        HEAP8[r22 + 2 | 0] = tempBigInt & 255;
        tempBigInt = tempBigInt >> 8;
        HEAP8[r22 + 3 | 0] = tempBigInt & 255;
        r22 = r19 + 44 | 0;
        tempBigInt = _htonl(r13);
        HEAP8[r22] = tempBigInt & 255;
        tempBigInt = tempBigInt >> 8;
        HEAP8[r22 + 1 | 0] = tempBigInt & 255;
        tempBigInt = tempBigInt >> 8;
        HEAP8[r22 + 2 | 0] = tempBigInt & 255;
        tempBigInt = tempBigInt >> 8;
        HEAP8[r22 + 3 | 0] = tempBigInt & 255;
        r22 = r19 + 48 | 0;
        tempBigInt = _htonl(HEAP32[r12]);
        HEAP8[r22] = tempBigInt & 255;
        tempBigInt = tempBigInt >> 8;
        HEAP8[r22 + 1 | 0] = tempBigInt & 255;
        tempBigInt = tempBigInt >> 8;
        HEAP8[r22 + 2 | 0] = tempBigInt & 255;
        tempBigInt = tempBigInt >> 8;
        HEAP8[r22 + 3 | 0] = tempBigInt & 255;
        r22 = r19 + 52 | 0;
        tempBigInt = _htonl(r4);
        HEAP8[r22] = tempBigInt & 255;
        tempBigInt = tempBigInt >> 8;
        HEAP8[r22 + 1 | 0] = tempBigInt & 255;
        tempBigInt = tempBigInt >> 8;
        HEAP8[r22 + 2 | 0] = tempBigInt & 255;
        tempBigInt = tempBigInt >> 8;
        HEAP8[r22 + 3 | 0] = tempBigInt & 255;
        _enet_list_insert(r9, r19);
        r19 = r13 + 1 | 0;
        r22 = r20 + r4 | 0;
        r21 = HEAP32[r12];
        if (r22 >>> 0 < r21 >>> 0) {
          r5 = r20;
          r13 = r19;
          r4 = r22;
          r15 = r21;
        } else {
          r18 = r19;
          break L641;
        }
      }
      r15 = r8 | 0;
      r4 = r8 | 0;
      r13 = HEAP32[r4 >> 2];
      if ((r13 | 0) == (r15 | 0)) {
        r11 = -1;
        STACKTOP = r6;
        return r11;
      } else {
        r23 = r13;
      }
      while (1) {
        _enet_free(_enet_list_remove(r23));
        r13 = HEAP32[r4 >> 2];
        if ((r13 | 0) == (r15 | 0)) {
          r11 = -1;
          break;
        } else {
          r23 = r13;
        }
      }
      STACKTOP = r6;
      return r11;
    }
  } while (0);
  r23 = r3 | 0;
  HEAP32[r23 >> 2] = HEAP32[r23 >> 2] + r18 | 0;
  r18 = r8 | 0;
  r23 = r8 | 0;
  r8 = HEAP32[r23 >> 2];
  if ((r8 | 0) == (r18 | 0)) {
    r11 = 0;
    STACKTOP = r6;
    return r11;
  } else {
    r24 = r8;
  }
  while (1) {
    _enet_peer_setup_outgoing_command(r1, _enet_list_remove(r24));
    r8 = HEAP32[r23 >> 2];
    if ((r8 | 0) == (r18 | 0)) {
      r11 = 0;
      break;
    } else {
      r24 = r8;
    }
  }
  STACKTOP = r6;
  return r11;
}
function _enet_peer_setup_outgoing_command(r1, r2) {
  var r3, r4, r5, r6, r7, r8, r9, r10, r11;
  r3 = 0;
  r4 = r2 + 33 | 0;
  r5 = HEAPU8[r4];
  r6 = HEAP32[r1 + 40 >> 2];
  r7 = r6 + (r5 * 60 & -1) | 0;
  r8 = r2 + 32 | 0;
  r9 = r1 + 68 | 0;
  HEAP32[r9 >> 2] = _enet_protocol_command_size(HEAP8[r8]) + HEAPU16[r2 + 28 >> 1] + HEAP32[r9 >> 2] | 0;
  do {
    if (HEAP8[r4] << 24 >> 24 == -1) {
      r9 = r1 + 188 | 0;
      r10 = HEAP16[r9 >> 1] + 1 & 65535;
      HEAP16[r9 >> 1] = r10;
      HEAP16[r2 + 8 >> 1] = r10;
      HEAP16[r2 + 10 >> 1] = 0;
    } else {
      r10 = HEAPU8[r8];
      if ((r10 & 128 | 0) != 0) {
        r9 = (r7 | 0) >> 1;
        HEAP16[r9] = HEAP16[r9] + 1 & 65535;
        HEAP16[r6 + (r5 * 60 & -1) + 2 >> 1] = 0;
        HEAP16[r2 + 8 >> 1] = HEAP16[r9];
        HEAP16[r2 + 10 >> 1] = 0;
        break;
      }
      if ((r10 & 64 | 0) != 0) {
        r10 = r1 + 246 | 0;
        HEAP16[r10 >> 1] = HEAP16[r10 >> 1] + 1 & 65535;
        HEAP16[r2 + 8 >> 1] = 0;
        HEAP16[r2 + 10 >> 1] = 0;
        break;
      }
      if ((HEAP32[r2 + 24 >> 2] | 0) == 0) {
        r10 = r6 + (r5 * 60 & -1) + 2 | 0;
        HEAP16[r10 >> 1] = HEAP16[r10 >> 1] + 1 & 65535;
      }
      HEAP16[r2 + 8 >> 1] = HEAP16[r7 >> 1];
      HEAP16[r2 + 10 >> 1] = HEAP16[r6 + (r5 * 60 & -1) + 2 >> 1];
    }
  } while (0);
  HEAP16[r2 + 30 >> 1] = 0;
  HEAP32[r2 + 12 >> 2] = 0;
  HEAP32[r2 + 16 >> 2] = 0;
  HEAP32[r2 + 20 >> 2] = 0;
  r5 = r2 + 34 | 0;
  tempBigInt = _htons(HEAP16[r2 + 8 >> 1]);
  HEAP8[r5] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r5 + 1 | 0] = tempBigInt & 255;
  r5 = HEAP8[r8];
  r6 = r5 & 15;
  do {
    if ((r6 | 0) == 7) {
      r7 = r2 + 36 | 0;
      tempBigInt = _htons(HEAP16[r2 + 10 >> 1]);
      HEAP8[r7] = tempBigInt & 255;
      tempBigInt = tempBigInt >> 8;
      HEAP8[r7 + 1 | 0] = tempBigInt & 255;
      r3 = 512;
      break;
    } else if ((r6 | 0) == 9) {
      r7 = r2 + 36 | 0;
      tempBigInt = _htons(HEAP16[r1 + 246 >> 1]);
      HEAP8[r7] = tempBigInt & 255;
      tempBigInt = tempBigInt >> 8;
      HEAP8[r7 + 1 | 0] = tempBigInt & 255;
      r3 = 512;
      break;
    } else {
      r11 = r5;
    }
  } while (0);
  if (r3 == 512) {
    r11 = HEAP8[r8];
  }
  if (r11 << 24 >> 24 < 0) {
    _enet_list_insert(r1 + 216 | 0, r2);
    return;
  } else {
    _enet_list_insert(r1 + 224 | 0, r2);
    return;
  }
}
function _enet_peer_receive(r1, r2) {
  var r3, r4;
  r3 = r1 + 232 | 0;
  r1 = HEAP32[r3 >> 2];
  if ((r1 | 0) == (r3 | 0)) {
    r4 = 0;
    return r4;
  }
  r3 = _enet_list_remove(r1);
  if ((r2 | 0) != 0) {
    HEAP8[r2] = HEAP8[r3 + 13 | 0];
  }
  r2 = HEAP32[r3 + 72 >> 2];
  r1 = r2 | 0;
  HEAP32[r1 >> 2] = HEAP32[r1 >> 2] - 1 | 0;
  r1 = HEAP32[r3 + 68 >> 2];
  if ((r1 | 0) != 0) {
    _enet_free(r1);
  }
  _enet_free(r3);
  r4 = r2;
  return r4;
}
function _enet_peer_reset_queues(r1) {
  var r2, r3, r4, r5, r6, r7, r8, r9, r10, r11;
  r2 = r1 + 240 | 0;
  if ((HEAP32[r2 >> 2] | 0) != 0) {
    _enet_list_remove(r1 | 0);
    HEAP32[r2 >> 2] = 0;
  }
  r2 = r1 + 192 | 0;
  r3 = r2 | 0;
  r4 = HEAP32[r3 >> 2];
  L698 : do {
    if ((r4 | 0) != (r2 | 0)) {
      r5 = r4;
      while (1) {
        _enet_free(_enet_list_remove(r5));
        r6 = HEAP32[r3 >> 2];
        if ((r6 | 0) == (r2 | 0)) {
          break L698;
        } else {
          r5 = r6;
        }
      }
    }
  } while (0);
  _enet_peer_reset_outgoing_commands(r1 + 200 | 0);
  _enet_peer_reset_outgoing_commands(r1 + 208 | 0);
  _enet_peer_reset_outgoing_commands(r1 + 216 | 0);
  _enet_peer_reset_outgoing_commands(r1 + 224 | 0);
  _enet_peer_reset_incoming_commands(r1 + 232 | 0);
  r2 = (r1 + 40 | 0) >> 2;
  r3 = HEAP32[r2];
  if ((r3 | 0) == 0) {
    HEAP32[r2] = 0;
    r7 = r1 + 44 | 0, r8 = r7 >> 2;
    HEAP32[r8] = 0;
    return;
  }
  r4 = (r1 + 44 | 0) >> 2;
  if ((HEAP32[r4] | 0) == 0) {
    HEAP32[r2] = 0;
    r7 = r1 + 44 | 0, r8 = r7 >> 2;
    HEAP32[r8] = 0;
    return;
  }
  r5 = HEAP32[r2];
  L708 : do {
    if (r3 >>> 0 < (r5 + (HEAP32[r4] * 60 & -1) | 0) >>> 0) {
      r6 = r3;
      while (1) {
        _enet_peer_reset_incoming_commands(r6 + 44 | 0);
        _enet_peer_reset_incoming_commands(r6 + 52 | 0);
        r9 = r6 + 60 | 0;
        r10 = HEAP32[r2];
        if (r9 >>> 0 < (r10 + (HEAP32[r4] * 60 & -1) | 0) >>> 0) {
          r6 = r9;
        } else {
          r11 = r10;
          break L708;
        }
      }
    } else {
      r11 = r5;
    }
  } while (0);
  _enet_free(r11);
  HEAP32[r2] = 0;
  r7 = r1 + 44 | 0, r8 = r7 >> 2;
  HEAP32[r8] = 0;
  return;
}
function _enet_peer_reset_outgoing_commands(r1) {
  var r2, r3, r4, r5, r6, r7;
  r2 = r1 | 0;
  r3 = r1 | 0;
  r1 = HEAP32[r3 >> 2];
  if ((r1 | 0) == (r2 | 0)) {
    return;
  } else {
    r4 = r1;
  }
  while (1) {
    r1 = _enet_list_remove(r4);
    r5 = r1 + 80 | 0;
    r6 = HEAP32[r5 >> 2];
    do {
      if ((r6 | 0) != 0) {
        r7 = r6 | 0;
        HEAP32[r7 >> 2] = HEAP32[r7 >> 2] - 1 | 0;
        r7 = HEAP32[r5 >> 2];
        if ((HEAP32[r7 >> 2] | 0) != 0) {
          break;
        }
        _enet_packet_destroy(r7);
      }
    } while (0);
    _enet_free(r1);
    r5 = HEAP32[r3 >> 2];
    if ((r5 | 0) == (r2 | 0)) {
      break;
    } else {
      r4 = r5;
    }
  }
  return;
}
function _enet_peer_reset_incoming_commands(r1) {
  _enet_peer_remove_incoming_commands(HEAP32[r1 >> 2], r1 | 0);
  return;
}
function _enet_peer_ping_interval(r1, r2) {
  HEAP32[r1 + 136 >> 2] = (r2 | 0) != 0 ? r2 : 500;
  return;
}
function _enet_peer_timeout(r1, r2, r3, r4) {
  HEAP32[r1 + 140 >> 2] = (r2 | 0) != 0 ? r2 : 32;
  HEAP32[r1 + 144 >> 2] = (r3 | 0) != 0 ? r3 : 5e3;
  HEAP32[r1 + 148 >> 2] = (r4 | 0) != 0 ? r4 : 3e4;
  return;
}
function _enet_protocol_command_size(r1) {
  return HEAP32[((r1 & 15) << 2) + 411016 >> 2];
}
function _enet_peer_reset(r1) {
  HEAP16[r1 + 12 >> 1] = 4095;
  HEAP32[r1 + 16 >> 2] = 0;
  HEAP32[r1 + 36 >> 2] = 0;
  _memset(r1 + 48 | 0, 0, 60);
  HEAP32[r1 + 108 >> 2] = 32;
  HEAP32[r1 + 112 >> 2] = 32;
  HEAP32[r1 + 116 >> 2] = 0;
  HEAP32[r1 + 120 >> 2] = 0;
  HEAP32[r1 + 124 >> 2] = 2;
  HEAP32[r1 + 128 >> 2] = 2;
  HEAP32[r1 + 132 >> 2] = 5e3;
  HEAP32[r1 + 136 >> 2] = 500;
  HEAP32[r1 + 140 >> 2] = 32;
  HEAP32[r1 + 144 >> 2] = 5e3;
  HEAP32[r1 + 148 >> 2] = 3e4;
  HEAP32[r1 + 152 >> 2] = 500;
  HEAP32[r1 + 156 >> 2] = 500;
  HEAP32[r1 + 160 >> 2] = 0;
  HEAP32[r1 + 164 >> 2] = 0;
  HEAP32[r1 + 168 >> 2] = 500;
  HEAP32[r1 + 172 >> 2] = 0;
  HEAP32[r1 + 176 >> 2] = HEAP32[HEAP32[r1 + 8 >> 2] + 24 >> 2];
  HEAP32[r1 + 184 >> 2] = 0;
  HEAP16[r1 + 188 >> 1] = 0;
  HEAP32[r1 + 180 >> 2] = 32768;
  _memset(r1 + 244 | 0, 0, 136);
  _enet_peer_reset_queues(r1);
  return;
}
function _enet_peer_ping(r1) {
  var r2, r3;
  r2 = STACKTOP;
  STACKTOP = STACKTOP + 48 | 0;
  r3 = r2;
  if ((HEAP32[r1 + 36 >> 2] | 0) != 5) {
    STACKTOP = r2;
    return;
  }
  HEAP8[r3 | 0] = -123;
  HEAP8[r3 + 1 | 0] = -1;
  _enet_peer_queue_outgoing_command(r1, r3, 0, 0, 0);
  STACKTOP = r2;
  return;
}
function _enet_peer_disconnect_now(r1, r2) {
  var r3, r4, r5;
  r3 = STACKTOP;
  STACKTOP = STACKTOP + 48 | 0;
  r4 = r3;
  r5 = HEAP32[r1 + 36 >> 2];
  if ((r5 | 0) == 0) {
    STACKTOP = r3;
    return;
  } else if (!((r5 | 0) == 9 | (r5 | 0) == 7)) {
    _enet_peer_reset_queues(r1);
    HEAP8[r4 | 0] = 68;
    HEAP8[r4 + 1 | 0] = -1;
    r5 = r4 + 4 | 0;
    tempBigInt = _htonl(r2);
    HEAP8[r5] = tempBigInt & 255;
    tempBigInt = tempBigInt >> 8;
    HEAP8[r5 + 1 | 0] = tempBigInt & 255;
    tempBigInt = tempBigInt >> 8;
    HEAP8[r5 + 2 | 0] = tempBigInt & 255;
    tempBigInt = tempBigInt >> 8;
    HEAP8[r5 + 3 | 0] = tempBigInt & 255;
    _enet_peer_queue_outgoing_command(r1, r4, 0, 0, 0);
    _enet_host_flush(HEAP32[r1 + 8 >> 2]);
  }
  _enet_peer_reset(r1);
  STACKTOP = r3;
  return;
}
function _enet_peer_disconnect(r1, r2) {
  var r3, r4, r5, r6, r7;
  r3 = STACKTOP;
  STACKTOP = STACKTOP + 48 | 0;
  r4 = r3;
  r5 = (r1 + 36 | 0) >> 2;
  r6 = HEAP32[r5];
  if ((r6 | 0) == 7 | (r6 | 0) == 0 | (r6 | 0) == 8 | (r6 | 0) == 9) {
    STACKTOP = r3;
    return;
  }
  _enet_peer_reset_queues(r1);
  r6 = r4 | 0;
  HEAP8[r6] = 4;
  HEAP8[r4 + 1 | 0] = -1;
  r7 = r4 + 4 | 0;
  tempBigInt = _htonl(r2);
  HEAP8[r7] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r7 + 1 | 0] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r7 + 2 | 0] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r7 + 3 | 0] = tempBigInt & 255;
  HEAP8[r6] = ((HEAP32[r5] - 5 | 0) >>> 0 < 2 ? -128 : 64) | HEAP8[r6];
  _enet_peer_queue_outgoing_command(r1, r4, 0, 0, 0);
  if ((HEAP32[r5] - 5 | 0) >>> 0 < 2) {
    HEAP32[r5] = 7;
    STACKTOP = r3;
    return;
  } else {
    _enet_host_flush(HEAP32[r1 + 8 >> 2]);
    _enet_peer_reset(r1);
    STACKTOP = r3;
    return;
  }
}
function _enet_peer_disconnect_later(r1, r2) {
  var r3, r4, r5;
  r3 = r1 + 36 | 0;
  L749 : do {
    if ((HEAP32[r3 >> 2] - 5 | 0) >>> 0 < 2) {
      r4 = r1 + 216 | 0;
      do {
        if ((HEAP32[r4 >> 2] | 0) == (r4 | 0)) {
          r5 = r1 + 224 | 0;
          if ((HEAP32[r5 >> 2] | 0) != (r5 | 0)) {
            break;
          }
          r5 = r1 + 200 | 0;
          if ((HEAP32[r5 >> 2] | 0) == (r5 | 0)) {
            break L749;
          }
        }
      } while (0);
      HEAP32[r3 >> 2] = 6;
      HEAP32[r1 + 376 >> 2] = r2;
      return;
    }
  } while (0);
  _enet_peer_disconnect(r1, r2);
  return;
}
function _enet_peer_queue_acknowledgement(r1, r2, r3) {
  var r4, r5, r6, r7, r8, r9;
  r4 = HEAPU8[r2 + 1 | 0];
  do {
    if (r4 >>> 0 < HEAP32[r1 + 44 >> 2] >>> 0) {
      r5 = r2 + 2 | 0;
      r6 = (tempInt = HEAPU8[r5] | HEAPU8[r5 + 1 | 0] << 8, tempInt << 16 >> 16);
      r5 = (r6 & 65535) >>> 12;
      r7 = HEAP16[HEAP32[r1 + 40 >> 2] + (r4 * 60 & -1) + 38 >> 1];
      r8 = ((r6 & 65535) < (r7 & 65535) ? r5 | 16 : r5) & 65535;
      r5 = (r7 & 65535) >>> 12 & 65535;
      if (r8 >>> 0 < (r5 + 7 | 0) >>> 0 | r8 >>> 0 > (r5 + 8 | 0) >>> 0) {
        break;
      } else {
        r9 = 0;
      }
      return r9;
    }
  } while (0);
  r4 = _enet_malloc(60);
  if ((r4 | 0) == 0) {
    r9 = 0;
    return r9;
  }
  r5 = r1 + 68 | 0;
  HEAP32[r5 >> 2] = HEAP32[r5 >> 2] + 8 | 0;
  HEAP32[r4 + 8 >> 2] = r3 & 65535;
  _memcpy(r4 + 12 | 0, r2 | 0, 48);
  _enet_list_insert(r1 + 192 | 0, r4);
  r9 = r4;
  return r9;
}
function _enet_peer_dispatch_incoming_unreliable_commands(r1, r2) {
  var r3, r4, r5, r6, r7, r8, r9, r10, r11, r12, r13, r14, r15, r16, r17, r18, r19, r20, r21;
  r3 = r2 + 52 | 0;
  r4 = (r3 | 0) >> 2;
  r5 = HEAP32[r4];
  if ((r5 | 0) == (r3 | 0)) {
    r6 = r5;
    r7 = HEAP32[r4];
    _enet_peer_remove_incoming_commands(r7, r6);
    return;
  }
  r8 = r2 + 38 | 0;
  r9 = r2 + 40 | 0;
  r2 = r1 + 232 | 0;
  r10 = r1 + 240 | 0;
  r11 = r1 + 8 | 0;
  r12 = r1;
  r13 = r5;
  r14 = r5;
  r15 = r5;
  L771 : while (1) {
    r5 = r14;
    do {
      if ((HEAP8[r14 + 12 | 0] & 15) << 24 >> 24 == 9) {
        r16 = r15;
        r17 = r13;
      } else {
        if (HEAP16[r14 + 8 >> 1] << 16 >> 16 != HEAP16[r8 >> 1] << 16 >> 16) {
          r18 = r13;
          r19 = r14;
          r20 = r15;
          break L771;
        }
        if ((HEAP32[r14 + 64 >> 2] | 0) == 0) {
          HEAP16[r9 >> 1] = HEAP16[r5 + 10 >> 1];
          r16 = r15;
          r17 = r13;
          break;
        }
        if ((r13 | 0) == (r14 | 0)) {
          r16 = r15;
          r17 = HEAP32[r14 >> 2];
          break;
        }
        _enet_list_move(r2, r13, HEAP32[r14 + 4 >> 2]);
        if ((HEAP32[r10 >> 2] | 0) == 0) {
          _enet_list_insert(HEAP32[r11 >> 2] + 52 | 0, r12);
          HEAP32[r10 >> 2] = 1;
        }
        r21 = HEAP32[r14 >> 2];
        r16 = r21;
        r17 = r21;
      }
    } while (0);
    r5 = HEAP32[r14 >> 2];
    if ((r5 | 0) == (r3 | 0)) {
      r18 = r17;
      r19 = r5;
      r20 = r16;
      break;
    } else {
      r13 = r17;
      r14 = r5;
      r15 = r16;
    }
  }
  if ((r18 | 0) == (r19 | 0)) {
    r6 = r20;
    r7 = HEAP32[r4];
    _enet_peer_remove_incoming_commands(r7, r6);
    return;
  }
  _enet_list_move(r1 + 232 | 0, r18, HEAP32[r19 + 4 >> 2]);
  r18 = r1 + 240 | 0;
  if ((HEAP32[r18 >> 2] | 0) == 0) {
    _enet_list_insert(HEAP32[r1 + 8 >> 2] + 52 | 0, r1);
    HEAP32[r18 >> 2] = 1;
  }
  r6 = HEAP32[r19 >> 2];
  r7 = HEAP32[r4];
  _enet_peer_remove_incoming_commands(r7, r6);
  return;
}
function _enet_peer_remove_incoming_commands(r1, r2) {
  var r3, r4, r5, r6;
  if ((r1 | 0) == (r2 | 0)) {
    return;
  } else {
    r3 = r1;
  }
  while (1) {
    r1 = HEAP32[r3 >> 2];
    _enet_list_remove(r3);
    r4 = r3 + 72 | 0;
    r5 = HEAP32[r4 >> 2];
    do {
      if ((r5 | 0) != 0) {
        r6 = r5 | 0;
        HEAP32[r6 >> 2] = HEAP32[r6 >> 2] - 1 | 0;
        r6 = HEAP32[r4 >> 2];
        if ((HEAP32[r6 >> 2] | 0) != 0) {
          break;
        }
        _enet_packet_destroy(r6);
      }
    } while (0);
    r4 = HEAP32[r3 + 68 >> 2];
    if ((r4 | 0) != 0) {
      _enet_free(r4);
    }
    _enet_free(r3);
    if ((r1 | 0) == (r2 | 0)) {
      break;
    } else {
      r3 = r1;
    }
  }
  return;
}
function _enet_peer_dispatch_incoming_reliable_commands(r1, r2) {
  var r3, r4, r5, r6, r7, r8, r9, r10;
  r3 = r2 + 44 | 0;
  r4 = (r3 | 0) >> 2;
  r5 = HEAP32[r4];
  L808 : do {
    if ((r5 | 0) == (r3 | 0)) {
      r6 = r5;
    } else {
      r7 = (r2 + 38 | 0) >> 1;
      r8 = r5;
      while (1) {
        if ((HEAP32[r8 + 64 >> 2] | 0) != 0) {
          r6 = r8;
          break L808;
        }
        r9 = HEAP16[r8 + 8 >> 1];
        if (r9 << 16 >> 16 != (HEAP16[r7] + 1 & 65535) << 16 >> 16) {
          r6 = r8;
          break L808;
        }
        HEAP16[r7] = r9;
        r10 = HEAP32[r8 + 60 >> 2];
        if ((r10 | 0) != 0) {
          HEAP16[r7] = (r9 & 65535) + r10 + 65535 & 65535;
        }
        r10 = HEAP32[r8 >> 2];
        if ((r10 | 0) == (r3 | 0)) {
          r6 = r10;
          break L808;
        } else {
          r8 = r10;
        }
      }
    }
  } while (0);
  if ((r6 | 0) == (HEAP32[r4] | 0)) {
    return;
  }
  HEAP16[r2 + 40 >> 1] = 0;
  _enet_list_move(r1 + 232 | 0, HEAP32[r4], HEAP32[r6 + 4 >> 2]);
  r6 = r1 + 240 | 0;
  if ((HEAP32[r6 >> 2] | 0) == 0) {
    _enet_list_insert(HEAP32[r1 + 8 >> 2] + 52 | 0, r1);
    HEAP32[r6 >> 2] = 1;
  }
  _enet_peer_dispatch_incoming_unreliable_commands(r1, r2);
  return;
}
function _enet_peer_queue_incoming_command(r1, r2, r3, r4) {
  var r5, r6, r7, r8, r9, r10, r11, r12, r13, r14, r15, r16, r17, r18, r19, r20, r21, r22, r23, r24, r25, r26, r27, r28;
  r5 = 0;
  r6 = HEAPU8[r2 + 1 | 0];
  r7 = HEAP32[r1 + 40 >> 2];
  r8 = r7 + (r6 * 60 & -1) | 0;
  L826 : do {
    if ((HEAP32[r1 + 36 >> 2] | 0) == 6) {
      r5 = 675;
    } else {
      r9 = r2 | 0;
      if ((HEAP8[r9] & 15) << 24 >> 24 == 9) {
        r10 = 0;
      } else {
        r11 = r2 + 2 | 0;
        r12 = (tempInt = HEAPU8[r11] | HEAPU8[r11 + 1 | 0] << 8, tempInt << 16 >> 16);
        r11 = (r12 & 65535) >>> 12;
        r13 = HEAP16[r7 + (r6 * 60 & -1) + 38 >> 1];
        r14 = (r13 & 65535) >>> 12;
        r15 = (r12 & 65535) < (r13 & 65535) ? r11 | 16 : r11;
        if ((r15 & 65535) < (r14 & 65535)) {
          r5 = 675;
          break;
        }
        if ((r15 & 65535) >>> 0 < ((r14 & 65535) + 7 | 0) >>> 0) {
          r10 = r12 & 65535;
        } else {
          r5 = 675;
          break;
        }
      }
      r12 = HEAP8[r9] & 15;
      L832 : do {
        if ((r12 | 0) == 8 | (r12 | 0) == 6) {
          r14 = r7 + (r6 * 60 & -1) + 38 | 0;
          if ((r10 | 0) == (HEAPU16[r14 >> 1] | 0)) {
            r5 = 675;
            break L826;
          }
          r15 = r7 + (r6 * 60 & -1) + 44 | 0;
          r11 = HEAP32[r7 + (r6 * 60 & -1) + 48 >> 2];
          if ((r11 | 0) == (r15 | 0)) {
            r16 = r11;
            r17 = 0;
            break;
          }
          r13 = HEAP16[r14 >> 1];
          r14 = r10 >>> 0 < (r13 & 65535) >>> 0;
          r18 = r11;
          while (1) {
            r11 = r18 + 8 | 0;
            r19 = HEAPU16[r11 >> 1] < (r13 & 65535);
            do {
              if (r14) {
                if (r19) {
                  r5 = 645;
                  break;
                } else {
                  r16 = r18;
                  r17 = 0;
                  break L832;
                }
              } else {
                if (r19) {
                  break;
                } else {
                  r5 = 645;
                  break;
                }
              }
            } while (0);
            if (r5 == 645) {
              r5 = 0;
              r20 = HEAPU16[r11 >> 1];
              if (r20 >>> 0 <= r10 >>> 0) {
                break;
              }
            }
            r19 = HEAP32[r18 + 4 >> 2];
            if ((r19 | 0) == (r15 | 0)) {
              r16 = r19;
              r17 = 0;
              break L832;
            } else {
              r18 = r19;
            }
          }
          if (r20 >>> 0 < r10 >>> 0) {
            r16 = r18;
            r17 = 0;
          } else {
            r5 = 675;
            break L826;
          }
        } else if ((r12 | 0) == 7 | (r12 | 0) == 12) {
          r15 = r2 + 4 | 0;
          r14 = _htons((tempInt = HEAPU8[r15] | HEAPU8[r15 + 1 | 0] << 8, tempInt << 16 >> 16));
          r15 = r7 + (r6 * 60 & -1) + 38 | 0;
          if ((r10 | 0) == (HEAPU16[r15 >> 1] | 0)) {
            if ((r14 & 65535) <= HEAPU16[r7 + (r6 * 60 & -1) + 40 >> 1]) {
              r5 = 675;
              break L826;
            }
          }
          r13 = r7 + (r6 * 60 & -1) + 52 | 0;
          r19 = HEAP32[r7 + (r6 * 60 & -1) + 56 >> 2];
          if ((r19 | 0) == (r13 | 0)) {
            r16 = r19;
            r17 = r14;
            break;
          }
          r21 = (HEAP8[r9] & 15) << 24 >> 24 == 9;
          r22 = r19;
          L850 : while (1) {
            r19 = r22;
            do {
              if (!r21) {
                r23 = HEAP16[r15 >> 1];
                r24 = r22 + 8 | 0;
                r25 = HEAPU16[r24 >> 1] < (r23 & 65535);
                if (r10 >>> 0 < (r23 & 65535) >>> 0) {
                  if (!r25) {
                    r16 = r22;
                    r17 = r14;
                    break L832;
                  }
                } else {
                  if (r25) {
                    break;
                  }
                }
                r25 = HEAPU16[r24 >> 1];
                if (r25 >>> 0 < r10 >>> 0) {
                  r16 = r22;
                  r17 = r14;
                  break L832;
                }
                if (r25 >>> 0 > r10 >>> 0) {
                  break;
                }
                r26 = HEAP16[r19 + 10 >> 1];
                if ((r26 & 65535) <= (r14 & 65535)) {
                  break L850;
                }
              }
            } while (0);
            r19 = HEAP32[r22 + 4 >> 2];
            if ((r19 | 0) == (r13 | 0)) {
              r16 = r19;
              r17 = r14;
              break L832;
            } else {
              r22 = r19;
            }
          }
          if ((r26 & 65535) < (r14 & 65535)) {
            r16 = r22;
            r17 = r14;
          } else {
            r5 = 675;
            break L826;
          }
        } else if ((r12 | 0) == 9) {
          r16 = r7 + (r6 * 60 & -1) + 52 | 0;
          r17 = 0;
        } else {
          r5 = 675;
          break L826;
        }
      } while (0);
      r12 = _enet_malloc(76);
      r13 = r12;
      if ((r12 | 0) == 0) {
        break;
      }
      r15 = r2 + 2 | 0;
      HEAP16[r12 + 8 >> 1] = (tempInt = HEAPU8[r15] | HEAPU8[r15 + 1 | 0] << 8, tempInt << 16 >> 16);
      HEAP16[r12 + 10 >> 1] = r17;
      _memcpy(r12 + 12 | 0, r9, 48);
      HEAP32[r12 + 60 >> 2] = r4;
      HEAP32[r12 + 64 >> 2] = r4;
      HEAP32[r12 + 72 >> 2] = r3;
      r15 = (r12 + 68 | 0) >> 2;
      HEAP32[r15] = 0;
      do {
        if ((r4 | 0) != 0) {
          if (r4 >>> 0 < 1048577) {
            r21 = _enet_malloc((r4 + 31 | 0) >>> 5 << 2);
            HEAP32[r15] = r21;
            r27 = r21;
          } else {
            r27 = HEAP32[r15];
          }
          if ((r27 | 0) == 0) {
            _enet_free(r12);
            break L826;
          } else {
            _memset(r27, 0, (r4 + 31 | 0) >>> 5 << 2);
            break;
          }
        }
      } while (0);
      if ((r3 | 0) != 0) {
        r15 = r3 | 0;
        HEAP32[r15 >> 2] = HEAP32[r15 >> 2] + 1 | 0;
      }
      _enet_list_insert(HEAP32[r16 >> 2], r12);
      r15 = HEAP8[r9] & 15;
      if ((r15 | 0) == 8 | (r15 | 0) == 6) {
        _enet_peer_dispatch_incoming_reliable_commands(r1, r8);
        r28 = r13;
        return r28;
      } else {
        _enet_peer_dispatch_incoming_unreliable_commands(r1, r8);
        r28 = r13;
        return r28;
      }
    }
  } while (0);
  do {
    if (r5 == 675) {
      if ((r4 | 0) != 0) {
        break;
      }
      if ((r3 | 0) == 0) {
        r28 = 409916;
        return r28;
      }
      if ((HEAP32[r3 >> 2] | 0) != 0) {
        r28 = 409916;
        return r28;
      }
      _enet_packet_destroy(r3);
      r28 = 409916;
      return r28;
    }
  } while (0);
  if ((r3 | 0) == 0) {
    r28 = 0;
    return r28;
  }
  if ((HEAP32[r3 >> 2] | 0) != 0) {
    r28 = 0;
    return r28;
  }
  _enet_packet_destroy(r3);
  r28 = 0;
  return r28;
}
function _enet_host_flush(r1) {
  HEAP32[r1 + 48 >> 2] = _enet_time_get();
  _enet_protocol_send_outgoing_commands(r1, 0, 0);
  return;
}
function _enet_protocol_send_outgoing_commands(r1, r2, r3) {
  var r4, r5, r6, r7, r8, r9, r10, r11, r12, r13, r14, r15, r16, r17, r18, r19, r20, r21, r22, r23, r24, r25, r26, r27, r28, r29, r30, r31, r32, r33, r34, r35, r36, r37, r38, r39, r40, r41, r42, r43, r44, r45, r46, r47, r48, r49, r50, r51, r52, r53, r54;
  r4 = 0;
  r5 = STACKTOP;
  STACKTOP = STACKTOP + 8 | 0;
  r6 = r5;
  r7 = r6 | 0;
  r8 = r6;
  r9 = r6;
  r10 = (r1 + 60 | 0) >> 2;
  HEAP32[r10] = 1;
  r11 = r1 + 36 | 0;
  r12 = r1 + 40 | 0;
  r13 = (r1 + 68 | 0) >> 1;
  r14 = r1 + 1608 | 0;
  r15 = (r1 + 2132 | 0) >> 2;
  r16 = (r1 + 64 | 0) >> 2;
  r17 = (r3 | 0) == 0;
  r3 = r1 + 48 | 0;
  r18 = (r1 + 48 | 0) >> 2;
  r19 = r1 + 1612 | 0;
  r20 = r19 | 0;
  r21 = r19 | 0;
  r19 = r6 + 2 | 0;
  r6 = r1 + 1616 | 0;
  r22 = r1 + 2140 | 0;
  r23 = r1 + 2136 | 0;
  r24 = r1 | 0;
  r25 = r1 + 10364 | 0;
  r26 = r1 + 10368 | 0;
  r27 = r1 + 6252 | 0;
  r28 = r1 + 1620 | 0;
  r29 = r1 + 1624 | 0;
  r30 = (r1 + 1616 | 0) >> 2;
  r31 = r1 + 2144 | 0;
  r32 = r1 + 1620 | 0;
  r33 = r1 + 6252 | 0;
  r34 = r1 + 1616 | 0;
  r35 = r1 + 48 | 0;
  r36 = (r2 | 0) == 0;
  r37 = r2 | 0;
  L903 : while (1) {
    HEAP32[r10] = 0;
    if ((HEAP32[r12 >> 2] | 0) <= 0) {
      r38 = 0;
      r4 = 742;
      break;
    }
    r39 = HEAP32[r11 >> 2], r40 = r39 >> 2;
    while (1) {
      r41 = HEAP32[r40 + 9];
      L908 : do {
        if (!((r41 | 0) == 0 | (r41 | 0) == 9)) {
          HEAP16[r13] = 0;
          HEAP32[r14 >> 2] = 0;
          HEAP32[r15] = 1;
          HEAP32[r16] = 4;
          r42 = r39 + 192 | 0;
          if ((HEAP32[r42 >> 2] | 0) != (r42 | 0)) {
            _enet_protocol_send_acknowledgements(r1, r39);
          }
          do {
            if (!r17) {
              r42 = r39 + 200 | 0;
              if ((HEAP32[r42 >> 2] | 0) == (r42 | 0)) {
                break;
              }
              if ((HEAP32[r35 >> 2] - HEAP32[r40 + 20] | 0) >>> 0 > 86399999) {
                break;
              }
              if ((_enet_protocol_check_timeouts(r1, r39, r2) | 0) != 1) {
                break;
              }
              if (r36) {
                break L908;
              }
              if ((HEAP32[r37 >> 2] | 0) == 0) {
                break L908;
              } else {
                r38 = 1;
                r4 = 744;
                break L903;
              }
            }
          } while (0);
          r42 = r39 + 216 | 0;
          do {
            if ((HEAP32[r42 >> 2] | 0) == (r42 | 0)) {
              r4 = 707;
            } else {
              if ((_enet_protocol_send_reliable_outgoing_commands(r1, r39) | 0) == 0) {
                break;
              } else {
                r4 = 707;
                break;
              }
            }
          } while (0);
          do {
            if (r4 == 707) {
              r4 = 0;
              r42 = r39 + 200 | 0;
              if ((HEAP32[r42 >> 2] | 0) != (r42 | 0)) {
                break;
              }
              r42 = HEAP32[r3 >> 2];
              r43 = HEAP32[r40 + 19];
              r44 = r42 - r43 | 0;
              if ((r44 >>> 0 > 86399999 ? r43 - r42 | 0 : r44) >>> 0 < HEAP32[r40 + 34] >>> 0) {
                break;
              }
              if ((HEAP32[r40 + 44] - HEAP32[r16] | 0) >>> 0 <= 3) {
                break;
              }
              _enet_peer_ping(r39);
              _enet_protocol_send_reliable_outgoing_commands(r1, r39);
            }
          } while (0);
          r44 = r39 + 224 | 0;
          if ((HEAP32[r44 >> 2] | 0) != (r44 | 0)) {
            _enet_protocol_send_unreliable_outgoing_commands(r1, r39);
          }
          if ((HEAP32[r14 >> 2] | 0) == 0) {
            break;
          }
          r44 = (r39 + 88 | 0) >> 2;
          r42 = HEAP32[r44];
          r43 = HEAP32[r18];
          do {
            if ((r42 | 0) == 0) {
              HEAP32[r44] = r43;
            } else {
              r45 = r43 - r42 | 0;
              if ((r45 >>> 0 > 86399999 ? r42 - r43 | 0 : r45) >>> 0 <= 9999) {
                break;
              }
              r45 = r39 + 92 | 0;
              r46 = HEAP32[r45 >> 2];
              if ((r46 | 0) == 0) {
                break;
              }
              r47 = r39 + 96 | 0;
              r48 = Math.floor((HEAP32[r47 >> 2] << 16 >>> 0) / (r46 >>> 0));
              r46 = (r39 + 104 | 0) >> 2;
              r49 = HEAP32[r46];
              HEAP32[r46] = r49 - (r49 >>> 2) | 0;
              r49 = (r39 + 100 | 0) >> 2;
              r50 = HEAP32[r49];
              if (r48 >>> 0 < r50 >>> 0) {
                r51 = r50 - ((r50 - r48 | 0) >>> 3) | 0;
                HEAP32[r49] = r51;
                r52 = HEAP32[r46] + ((r51 - r48 | 0) >>> 2) | 0;
              } else {
                r51 = ((r48 - r50 | 0) >>> 3) + r50 | 0;
                HEAP32[r49] = r51;
                r52 = HEAP32[r46] + ((r48 - r51 | 0) >>> 2) | 0;
              }
              HEAP32[r46] = r52;
              HEAP32[r44] = HEAP32[r18];
              HEAP32[r45 >> 2] = 0;
              HEAP32[r47 >> 2] = 0;
            }
          } while (0);
          HEAP32[r21 >> 2] = r9;
          if (HEAP16[r13] << 16 >> 16 < 0) {
            HEAP16[r19 >> 1] = _htons(HEAP32[r18] & 65535);
            HEAP32[r6 >> 2] = 4;
          } else {
            HEAP32[r34 >> 2] = 2;
          }
          r44 = HEAP32[r22 >> 2];
          do {
            if ((r44 | 0) == 0) {
              r53 = 0;
            } else {
              r43 = HEAP32[r31 >> 2];
              if ((r43 | 0) == 0) {
                r53 = 0;
                break;
              }
              r42 = HEAP32[r16] - 4 | 0;
              r47 = FUNCTION_TABLE[r43](r44, r32, HEAP32[r15] - 1 | 0, r42, r33, r42);
              if (!((r47 | 0) != 0 & r47 >>> 0 < r42 >>> 0)) {
                r53 = 0;
                break;
              }
              HEAP16[r13] = HEAP16[r13] | 16384;
              r53 = r47;
            }
          } while (0);
          r44 = (r39 + 12 | 0) >> 1;
          if (HEAPU16[r44] < 4095) {
            HEAP16[r13] = HEAPU8[r39 + 20 | 0] << 12 | HEAP16[r13];
          }
          HEAP16[r7 >> 1] = _htons(HEAP16[r13] | HEAP16[r44]);
          if ((HEAP32[r23 >> 2] | 0) != 0) {
            r47 = r8 + HEAP32[r30] | 0;
            if (HEAPU16[r44] < 4095) {
              r54 = HEAP32[r40 + 4];
            } else {
              r54 = 0;
            }
            HEAP32[r47 >> 2] = r54;
            HEAP32[r30] = HEAP32[r30] + 4 | 0;
            HEAP32[r47 >> 2] = FUNCTION_TABLE[HEAP32[r23 >> 2]](r20, HEAP32[r15]);
          }
          if ((r53 | 0) != 0) {
            HEAP32[r28 >> 2] = r27;
            HEAP32[r29 >> 2] = r53;
            HEAP32[r15] = 2;
          }
          HEAP32[r40 + 18] = HEAP32[r18];
          r47 = _enet_socket_send(HEAP32[r24 >> 2], r39 + 24 | 0, r20, HEAP32[r15]);
          _enet_protocol_remove_sent_unreliable_commands(r39);
          if ((r47 | 0) < 0) {
            r38 = -1;
            r4 = 743;
            break L903;
          }
          HEAP32[r25 >> 2] = HEAP32[r25 >> 2] + r47 | 0;
          HEAP32[r26 >> 2] = HEAP32[r26 >> 2] + 1 | 0;
        }
      } while (0);
      r41 = r39 + 380 | 0;
      if (r41 >>> 0 < (HEAP32[r11 >> 2] + (HEAP32[r12 >> 2] * 380 & -1) | 0) >>> 0) {
        r39 = r41, r40 = r39 >> 2;
      } else {
        break;
      }
    }
    if ((HEAP32[r10] | 0) == 0) {
      r38 = 0;
      r4 = 741;
      break;
    }
  }
  if (r4 == 744) {
    STACKTOP = r5;
    return r38;
  } else if (r4 == 741) {
    STACKTOP = r5;
    return r38;
  } else if (r4 == 742) {
    STACKTOP = r5;
    return r38;
  } else if (r4 == 743) {
    STACKTOP = r5;
    return r38;
  }
}
function _enet_host_check_events(r1, r2) {
  var r3;
  if ((r2 | 0) == 0) {
    r3 = -1;
    return r3;
  }
  HEAP32[r2 >> 2] = 0;
  HEAP32[r2 + 4 >> 2] = 0;
  HEAP32[r2 + 16 >> 2] = 0;
  r3 = _enet_protocol_dispatch_incoming_commands(r1, r2);
  return r3;
}
function _enet_protocol_dispatch_incoming_commands(r1, r2) {
  var r3, r4, r5, r6, r7, r8, r9, r10, r11, r12, r13, r14, r15, r16, r17;
  r3 = r2 >> 2;
  r4 = 0;
  r5 = r1 + 52 | 0;
  r6 = r5 | 0;
  r7 = HEAP32[r6 >> 2];
  if ((r7 | 0) == (r5 | 0)) {
    r8 = 0;
    return r8;
  }
  r9 = r2 + 8 | 0;
  r10 = r2 + 16 | 0;
  r2 = r7;
  L980 : while (1) {
    r11 = _enet_list_remove(r2);
    r12 = r11;
    r13 = r11 + 240 | 0;
    HEAP32[r13 >> 2] = 0;
    r14 = r11 + 36 | 0;
    r7 = HEAP32[r14 >> 2];
    do {
      if ((r7 | 0) == 5) {
        r15 = r11 + 232 | 0;
        r16 = r15;
        r17 = r15;
        if ((HEAP32[r17 >> 2] | 0) == (r16 | 0)) {
          break;
        }
        r15 = _enet_peer_receive(r12, r9);
        HEAP32[r10 >> 2] = r15;
        if ((r15 | 0) != 0) {
          r4 = 758;
          break L980;
        }
      } else if ((r7 | 0) == 3 | (r7 | 0) == 4) {
        r4 = 753;
        break L980;
      } else if ((r7 | 0) == 9) {
        r4 = 754;
        break L980;
      }
    } while (0);
    r7 = HEAP32[r6 >> 2];
    if ((r7 | 0) == (r5 | 0)) {
      r8 = 0;
      r4 = 761;
      break;
    } else {
      r2 = r7;
    }
  }
  if (r4 == 758) {
    HEAP32[r3] = 3;
    HEAP32[r3 + 1] = r12;
    if ((HEAP32[r17 >> 2] | 0) == (r16 | 0)) {
      r8 = 1;
      return r8;
    }
    HEAP32[r13 >> 2] = 1;
    _enet_list_insert(r5, r11);
    r8 = 1;
    return r8;
  } else if (r4 == 761) {
    return r8;
  } else if (r4 == 753) {
    HEAP32[r14 >> 2] = 5;
    HEAP32[r3] = 1;
    HEAP32[r3 + 1] = r12;
    HEAP32[r3 + 3] = HEAP32[r11 + 376 >> 2];
    r8 = 1;
    return r8;
  } else if (r4 == 754) {
    HEAP32[r1 + 32 >> 2] = 1;
    HEAP32[r3] = 2;
    HEAP32[r3 + 1] = r12;
    HEAP32[r3 + 3] = HEAP32[r11 + 376 >> 2];
    _enet_peer_reset(r12);
    r8 = 1;
    return r8;
  }
}
function _enet_host_service(r1, r2, r3) {
  var r4, r5, r6, r7, r8, r9, r10, r11, r12, r13, r14, r15;
  r4 = 0;
  r5 = STACKTOP;
  STACKTOP = STACKTOP + 4 | 0;
  r6 = r5;
  r7 = (r2 | 0) != 0;
  do {
    if (r7) {
      HEAP32[r2 >> 2] = 0;
      HEAP32[r2 + 4 >> 2] = 0;
      HEAP32[r2 + 16 >> 2] = 0;
      r8 = _enet_protocol_dispatch_incoming_commands(r1, r2);
      if ((r8 | 0) == 1) {
        r9 = 1;
        break;
      } else if ((r8 | 0) != -1) {
        r4 = 770;
        break;
      }
      _perror(411380);
      r9 = -1;
      break;
    } else {
      r4 = 770;
    }
  } while (0);
  L1001 : do {
    if (r4 == 770) {
      r8 = _enet_time_get();
      r10 = (r1 + 48 | 0) >> 2;
      HEAP32[r10] = r8;
      r11 = r8 + r3 | 0;
      r8 = r1 + 20 | 0;
      r12 = r1 | 0;
      while (1) {
        r13 = HEAP32[r10];
        r14 = HEAP32[r8 >> 2];
        r15 = r13 - r14 | 0;
        if ((r15 >>> 0 > 86399999 ? r14 - r13 | 0 : r15) >>> 0 > 999) {
          _enet_host_bandwidth_throttle(r1);
        }
        r15 = _enet_protocol_send_outgoing_commands(r1, r2, 1);
        if ((r15 | 0) == -1) {
          r4 = 774;
          break;
        } else if ((r15 | 0) == 1) {
          r9 = 1;
          break L1001;
        }
        r15 = _enet_protocol_receive_incoming_commands(r1, r2);
        if ((r15 | 0) == -1) {
          r4 = 776;
          break;
        } else if ((r15 | 0) == 1) {
          r9 = 1;
          break L1001;
        }
        r15 = _enet_protocol_send_outgoing_commands(r1, r2, 1);
        if ((r15 | 0) == -1) {
          r4 = 778;
          break;
        } else if ((r15 | 0) == 1) {
          r9 = 1;
          break L1001;
        }
        if (r7) {
          r15 = _enet_protocol_dispatch_incoming_commands(r1, r2);
          if ((r15 | 0) == -1) {
            r4 = 781;
            break;
          } else if ((r15 | 0) == 1) {
            r9 = 1;
            break L1001;
          }
        }
        r15 = _enet_time_get();
        HEAP32[r10] = r15;
        if ((r15 - r11 | 0) >>> 0 <= 86399999) {
          r9 = 0;
          break L1001;
        }
        HEAP32[r6 >> 2] = 2;
        r15 = HEAP32[r10];
        r13 = r11 - r15 | 0;
        if ((_enet_socket_wait(HEAP32[r12 >> 2], r6, r13 >>> 0 > 86399999 ? r15 - r11 | 0 : r13) | 0) != 0) {
          r9 = -1;
          break L1001;
        }
        HEAP32[r10] = _enet_time_get();
        if ((HEAP32[r6 >> 2] | 0) != 2) {
          r9 = 0;
          break L1001;
        }
      }
      if (r4 == 774) {
        _perror(411348);
        r9 = -1;
        break;
      } else if (r4 == 776) {
        _perror(411224);
        r9 = -1;
        break;
      } else if (r4 == 778) {
        _perror(411348);
        r9 = -1;
        break;
      } else if (r4 == 781) {
        _perror(411380);
        r9 = -1;
        break;
      }
    }
  } while (0);
  STACKTOP = r5;
  return r9;
}
function _enet_protocol_receive_incoming_commands(r1, r2) {
  var r3, r4, r5, r6, r7, r8, r9, r10, r11, r12, r13, r14, r15, r16, r17;
  r3 = 0;
  r4 = STACKTOP;
  STACKTOP = STACKTOP + 8 | 0;
  r5 = r4;
  r6 = r1 + 2156 | 0;
  r7 = r5 | 0;
  r8 = r5 + 4 | 0;
  r9 = r1 | 0;
  r10 = r1 + 10348 | 0;
  r11 = r1 + 10356 | 0;
  r12 = r1 + 10360 | 0;
  r13 = r1 + 10372 | 0;
  r14 = r1 + 10376 | 0;
  r15 = (r2 | 0) == 0;
  while (1) {
    HEAP32[r7 >> 2] = r6;
    HEAP32[r8 >> 2] = 4096;
    r16 = _enet_socket_receive(HEAP32[r9 >> 2], r10, r5, 1);
    if ((r16 | 0) < 0) {
      r17 = -1;
      r3 = 795;
      break;
    }
    if ((r16 | 0) == 0) {
      r17 = 0;
      r3 = 796;
      break;
    }
    HEAP32[r11 >> 2] = r6;
    HEAP32[r12 >> 2] = r16;
    HEAP32[r13 >> 2] = HEAP32[r13 >> 2] + r16 | 0;
    HEAP32[r14 >> 2] = HEAP32[r14 >> 2] + 1 | 0;
    if ((_enet_packet_filter(r1) | 0) == 0) {
      r17 = 0;
      r3 = 797;
      break;
    }
    r16 = _enet_protocol_handle_incoming_commands(r1, r2);
    if ((r16 | 0) == 1 | (r16 | 0) == -1) {
      r17 = r16;
      r3 = 798;
      break;
    }
    if (!r15) {
      r3 = 792;
      break;
    }
  }
  if (r3 == 792) {
    HEAP32[r2 >> 2] = 100;
    HEAP32[r2 + 12 >> 2] = 0;
    HEAP32[r2 + 16 >> 2] = _enet_packet_create(HEAP32[r11 >> 2], HEAP32[r12 >> 2], 4);
    r17 = 1;
    STACKTOP = r4;
    return r17;
  } else if (r3 == 798) {
    STACKTOP = r4;
    return r17;
  } else if (r3 == 796) {
    STACKTOP = r4;
    return r17;
  } else if (r3 == 797) {
    STACKTOP = r4;
    return r17;
  } else if (r3 == 795) {
    STACKTOP = r4;
    return r17;
  }
}
function _enet_protocol_handle_incoming_commands(r1, r2) {
  var r3, r4, r5, r6, r7, r8, r9, r10, r11, r12, r13, r14, r15, r16, r17, r18, r19, r20, r21, r22, r23, r24, r25, r26, r27;
  r3 = 0;
  r4 = STACKTOP;
  STACKTOP = STACKTOP + 12 | 0;
  r5 = r4, r6 = r5 >> 2;
  r7 = r4 + 4;
  r8 = (r1 + 10360 | 0) >> 2;
  if (HEAP32[r8] >>> 0 < 2) {
    r9 = 0;
    STACKTOP = r4;
    return r9;
  }
  r10 = (r1 + 10356 | 0) >> 2;
  r11 = HEAP32[r10];
  r12 = r11;
  r13 = _htons((tempInt = HEAPU8[r12] | HEAPU8[r12 + 1 | 0] << 8, tempInt << 16 >> 16));
  r12 = (r13 & 65535) >>> 12 & 3;
  r14 = r13 & 4095;
  r15 = r13 & -16384 & 65535;
  r13 = r15 & 32768;
  r16 = (r13 | 0) == 0;
  r17 = (r1 + 2136 | 0) >> 2;
  r18 = (r13 >>> 14) + ((HEAP32[r17] | 0) == 0 ? 2 : 6) | 0;
  r13 = r14 & 65535;
  do {
    if (r14 << 16 >> 16 == 4095) {
      r19 = 0;
    } else {
      if (r13 >>> 0 >= HEAP32[r1 + 40 >> 2] >>> 0) {
        r9 = 0;
        STACKTOP = r4;
        return r9;
      }
      r20 = HEAP32[r1 + 36 >> 2];
      r21 = r20 + (r13 * 380 & -1) | 0;
      r22 = HEAP32[r20 + (r13 * 380 & -1) + 36 >> 2];
      if ((r22 | 0) == 0 | (r22 | 0) == 9) {
        r9 = 0;
        STACKTOP = r4;
        return r9;
      }
      r22 = r20 + (r13 * 380 & -1) + 24 | 0;
      r23 = HEAP32[r22 >> 2];
      do {
        if ((HEAP32[r1 + 10348 >> 2] | 0) == (r23 | 0)) {
          if (HEAP16[r1 + 10352 >> 1] << 16 >> 16 == HEAP16[r20 + (r13 * 380 & -1) + 28 >> 1] << 16 >> 16) {
            break;
          }
          r24 = HEAP32[r22 >> 2];
          r3 = 806;
          break;
        } else {
          r24 = r23;
          r3 = 806;
        }
      } while (0);
      do {
        if (r3 == 806) {
          if ((r24 | 0) == -1) {
            break;
          } else {
            r9 = 0;
          }
          STACKTOP = r4;
          return r9;
        }
      } while (0);
      if (HEAPU16[r20 + (r13 * 380 & -1) + 12 >> 1] >= 4095) {
        r19 = r21;
        break;
      }
      if ((r12 | 0) == (HEAPU8[r20 + (r13 * 380 & -1) + 21 | 0] | 0)) {
        r19 = r21;
        break;
      } else {
        r9 = 0;
      }
      STACKTOP = r4;
      return r9;
    }
  } while (0);
  do {
    if ((r15 & 16384 | 0) != 0) {
      r13 = HEAP32[r1 + 2140 >> 2];
      if ((r13 | 0) == 0) {
        r9 = 0;
        STACKTOP = r4;
        return r9;
      }
      r12 = HEAP32[r1 + 2148 >> 2];
      if ((r12 | 0) == 0) {
        r9 = 0;
        STACKTOP = r4;
        return r9;
      }
      r24 = r1 + 6252 | 0;
      r14 = 4096 - r18 | 0;
      r23 = FUNCTION_TABLE[r12](r13, HEAP32[r10] + r18 | 0, HEAP32[r8] - r18 | 0, r1 + (r18 + 6252) | 0, r14);
      if ((r23 | 0) == 0 | r23 >>> 0 > r14 >>> 0) {
        r9 = 0;
        STACKTOP = r4;
        return r9;
      } else {
        _memcpy(r24, r11, r18);
        HEAP32[r10] = r24;
        HEAP32[r8] = r23 + r18 | 0;
        break;
      }
    }
  } while (0);
  do {
    if ((HEAP32[r17] | 0) != 0) {
      r15 = HEAP32[r10] + (r18 - 4) | 0;
      r23 = HEAP32[r15 >> 2];
      if ((r19 | 0) == 0) {
        r25 = 0;
      } else {
        r25 = HEAP32[r19 + 16 >> 2];
      }
      HEAP32[r15 >> 2] = r25;
      HEAP32[r7 >> 2] = HEAP32[r10];
      HEAP32[r7 + 4 >> 2] = HEAP32[r8];
      if ((FUNCTION_TABLE[HEAP32[r17]](r7, 1) | 0) == (r23 | 0)) {
        break;
      } else {
        r9 = 0;
      }
      STACKTOP = r4;
      return r9;
    }
  } while (0);
  if ((r19 | 0) != 0) {
    HEAP32[r19 + 24 >> 2] = HEAP32[r1 + 10348 >> 2];
    HEAP16[r19 + 28 >> 1] = HEAP16[r1 + 10352 >> 1];
    r7 = r19 + 64 | 0;
    HEAP32[r7 >> 2] = HEAP32[r7 >> 2] + HEAP32[r8] | 0;
  }
  r7 = HEAP32[r10] + r18 | 0;
  HEAP32[r6] = r7;
  r18 = HEAP32[r10] + HEAP32[r8] | 0;
  L1080 : do {
    if (r7 >>> 0 < r18 >>> 0) {
      r17 = r11 + 2 | 0;
      r25 = r19;
      r23 = r7;
      r15 = r18;
      while (1) {
        r24 = r23;
        if ((r23 + 4 | 0) >>> 0 > r15 >>> 0) {
          break L1080;
        }
        r14 = HEAP8[r23] & 15;
        if ((r14 & 255) > 12 | r14 << 24 >> 24 == 0) {
          break L1080;
        }
        r13 = r23 + HEAP32[((r14 & 255) << 2) + 411016 >> 2] | 0;
        if (r13 >>> 0 > r15 >>> 0) {
          break L1080;
        }
        HEAP32[r6] = r13;
        if (!((r25 | 0) != 0 | r14 << 24 >> 24 == 2)) {
          break L1080;
        }
        r14 = r23 + 2 | 0;
        tempBigInt = _htons((tempInt = HEAPU8[r14] | HEAPU8[r14 + 1 | 0] << 8, tempInt << 16 >> 16));
        HEAP8[r14] = tempBigInt & 255;
        tempBigInt = tempBigInt >> 8;
        HEAP8[r14 + 1 | 0] = tempBigInt & 255;
        r14 = HEAP8[r23] & 15;
        do {
          if ((r14 | 0) == 3) {
            if ((_enet_protocol_handle_verify_connect(r1, r2, r25, r24) | 0) == 0) {
              r3 = 838;
              break;
            } else {
              break L1080;
            }
          } else if ((r14 | 0) == 7) {
            if ((_enet_protocol_handle_send_unreliable(r1, r25, r24, r5) | 0) == 0) {
              r3 = 838;
              break;
            } else {
              break L1080;
            }
          } else if ((r14 | 0) == 2) {
            r13 = _enet_protocol_handle_connect(r1, r24);
            if ((r13 | 0) == 0) {
              break L1080;
            } else {
              r26 = r13;
              r3 = 839;
              break;
            }
          } else if ((r14 | 0) == 11) {
            _enet_protocol_handle_throttle_configure(r25, r24);
            r3 = 838;
            break;
          } else if ((r14 | 0) == 12) {
            if ((_enet_protocol_handle_send_unreliable_fragment(r1, r25, r24, r5) | 0) == 0) {
              r3 = 838;
              break;
            } else {
              break L1080;
            }
          } else if ((r14 | 0) == 8) {
            if ((_enet_protocol_handle_send_fragment(r1, r25, r24, r5) | 0) == 0) {
              r3 = 838;
              break;
            } else {
              break L1080;
            }
          } else if ((r14 | 0) == 1) {
            if ((_enet_protocol_handle_acknowledge(r1, r2, r25, r24) | 0) == 0) {
              r3 = 838;
              break;
            } else {
              break L1080;
            }
          } else if ((r14 | 0) == 9) {
            if ((_enet_protocol_handle_send_unsequenced(r1, r25, r24, r5) | 0) == 0) {
              r3 = 838;
              break;
            } else {
              break L1080;
            }
          } else if ((r14 | 0) == 10) {
            _enet_protocol_handle_bandwidth_limit(r1, r25, r24);
            r3 = 838;
            break;
          } else if ((r14 | 0) == 5) {
            r3 = 838;
          } else if ((r14 | 0) == 4) {
            _enet_protocol_handle_disconnect(r1, r25, r24);
            r3 = 838;
            break;
          } else if ((r14 | 0) == 6) {
            if ((_enet_protocol_handle_send_reliable(r1, r25, r24, r5) | 0) == 0) {
              r3 = 838;
              break;
            } else {
              break L1080;
            }
          } else {
            break L1080;
          }
        } while (0);
        do {
          if (r3 == 838) {
            r3 = 0;
            if ((r25 | 0) == 0) {
              r27 = 0;
              break;
            } else {
              r26 = r25;
              r3 = 839;
              break;
            }
          }
        } while (0);
        do {
          if (r3 == 839) {
            r3 = 0;
            r14 = HEAP8[r23];
            if (r14 << 24 >> 24 >= 0) {
              r27 = r26;
              break;
            }
            if (r16) {
              break L1080;
            }
            r13 = _htons((tempInt = HEAPU8[r17] | HEAPU8[r17 + 1 | 0] << 8, tempInt << 16 >> 16));
            r12 = HEAP32[r26 + 36 >> 2];
            if ((r12 | 0) == 7 | (r12 | 0) == 2) {
              r27 = r26;
              break;
            } else if ((r12 | 0) != 8) {
              _enet_peer_queue_acknowledgement(r26, r24, r13);
              r27 = r26;
              break;
            }
            if ((r14 & 15) << 24 >> 24 != 4) {
              r27 = r26;
              break;
            }
            _enet_peer_queue_acknowledgement(r26, r24, r13);
            r27 = r26;
          }
        } while (0);
        r24 = HEAP32[r6];
        r13 = HEAP32[r10] + HEAP32[r8] | 0;
        if (r24 >>> 0 < r13 >>> 0) {
          r25 = r27;
          r23 = r24;
          r15 = r13;
        } else {
          break L1080;
        }
      }
    }
  } while (0);
  do {
    if ((r2 | 0) != 0) {
      if ((HEAP32[r2 >> 2] | 0) == 0) {
        break;
      } else {
        r9 = 1;
      }
      STACKTOP = r4;
      return r9;
    }
  } while (0);
  r9 = 0;
  STACKTOP = r4;
  return r9;
}
function _enet_protocol_handle_acknowledge(r1, r2, r3, r4) {
  var r5, r6, r7, r8, r9, r10, r11, r12, r13, r14, r15, r16;
  r5 = r3 >> 2;
  r6 = 0;
  r7 = r4 + 6 | 0;
  r8 = _htons((tempInt = HEAPU8[r7] | HEAPU8[r7 + 1 | 0] << 8, tempInt << 16 >> 16)) & 65535;
  r7 = (r1 + 48 | 0) >> 2;
  r9 = HEAP32[r7];
  r10 = r9 & -65536 | r8;
  r11 = (r8 & 32768) >>> 0 > (r9 & 32768) >>> 0 ? r10 - 65536 | 0 : r10;
  if ((r9 - r11 | 0) >>> 0 > 86399999) {
    r12 = 0;
    return r12;
  }
  HEAP32[r5 + 19] = r9;
  HEAP32[r5 + 21] = 0;
  r9 = HEAP32[r7];
  r10 = r9 - r11 | 0;
  r8 = r10 >>> 0 > 86399999 ? r11 - r9 | 0 : r10;
  _enet_peer_throttle(r3, r8);
  r10 = (r3 + 172 | 0) >> 2;
  r9 = HEAP32[r10];
  HEAP32[r10] = r9 - (r9 >>> 2) | 0;
  r9 = (r3 + 168 | 0) >> 2;
  r11 = HEAP32[r9];
  if (r8 >>> 0 < r11 >>> 0) {
    r13 = r11 - ((r11 - r8 | 0) >>> 3) | 0;
    HEAP32[r9] = r13;
    r14 = HEAP32[r10] + ((r13 - r8 | 0) >>> 2) | 0;
  } else {
    r13 = ((r8 - r11 | 0) >>> 3) + r11 | 0;
    HEAP32[r9] = r13;
    r14 = HEAP32[r10] + ((r8 - r13 | 0) >>> 2) | 0;
  }
  HEAP32[r10] = r14;
  r14 = HEAP32[r9];
  r13 = (r3 + 156 | 0) >> 2;
  if (r14 >>> 0 < HEAP32[r13] >>> 0) {
    HEAP32[r13] = r14;
  }
  r14 = HEAP32[r10];
  r8 = (r3 + 164 | 0) >> 2;
  if (r14 >>> 0 > HEAP32[r8] >>> 0) {
    HEAP32[r8] = r14;
  }
  r14 = r3 + 120 | 0;
  r11 = HEAP32[r14 >> 2];
  do {
    if ((r11 | 0) == 0) {
      r6 = 871;
    } else {
      r15 = HEAP32[r7];
      r16 = r15 - r11 | 0;
      if ((r16 >>> 0 > 86399999 ? r11 - r15 | 0 : r16) >>> 0 < HEAP32[r5 + 33] >>> 0) {
        break;
      } else {
        r6 = 871;
        break;
      }
    }
  } while (0);
  if (r6 == 871) {
    HEAP32[r5 + 38] = HEAP32[r13];
    HEAP32[r5 + 40] = HEAP32[r8];
    HEAP32[r13] = HEAP32[r9];
    HEAP32[r8] = HEAP32[r10];
    HEAP32[r14 >> 2] = HEAP32[r7];
  }
  r7 = r4 + 4 | 0;
  r14 = _enet_protocol_remove_sent_reliable_command(r3, _htons((tempInt = HEAPU8[r7] | HEAPU8[r7 + 1 | 0] << 8, tempInt << 16 >> 16)), HEAP8[r4 + 1 | 0]);
  r4 = HEAP32[r5 + 9];
  if ((r4 | 0) == 7) {
    if ((r14 | 0) != 4) {
      r12 = -1;
      return r12;
    }
    _enet_protocol_notify_disconnect(r1, r3, r2);
    r12 = 0;
    return r12;
  } else if ((r4 | 0) == 6) {
    r7 = r3 + 216 | 0;
    if ((HEAP32[r7 >> 2] | 0) != (r7 | 0)) {
      r12 = 0;
      return r12;
    }
    r7 = r3 + 224 | 0;
    if ((HEAP32[r7 >> 2] | 0) != (r7 | 0)) {
      r12 = 0;
      return r12;
    }
    r7 = r3 + 200 | 0;
    if ((HEAP32[r7 >> 2] | 0) != (r7 | 0)) {
      r12 = 0;
      return r12;
    }
    _enet_peer_disconnect(r3, HEAP32[r5 + 94]);
    r12 = 0;
    return r12;
  } else if ((r4 | 0) == 2) {
    if ((r14 | 0) != 3) {
      r12 = -1;
      return r12;
    }
    _enet_protocol_notify_connect(r1, r3, r2);
    r12 = 0;
    return r12;
  } else {
    r12 = 0;
    return r12;
  }
}
function _enet_protocol_handle_connect(r1, r2) {
  var r3, r4, r5, r6, r7, r8, r9, r10, r11, r12, r13, r14, r15, r16, r17, r18, r19, r20, r21, r22, r23, r24, r25;
  r3 = 0;
  r4 = STACKTOP;
  STACKTOP = STACKTOP + 48 | 0;
  r5 = r4;
  r6 = r2 + 16 | 0;
  r7 = _htonl(HEAPU8[r6] | HEAPU8[r6 + 1 | 0] << 8 | HEAPU8[r6 + 2 | 0] << 16 | HEAPU8[r6 + 3 | 0] << 24 | 0);
  if ((r7 | 0) == 0 | r7 >>> 0 > 255) {
    r8 = 0;
    STACKTOP = r4;
    return r8;
  }
  r6 = (r1 + 36 | 0) >> 2;
  r9 = HEAP32[r6];
  r10 = (r1 + 40 | 0) >> 2;
  L1163 : do {
    if ((HEAP32[r10] | 0) > 0) {
      r11 = r1 + 10348 | 0;
      r12 = r1 + 10352 | 0;
      r13 = r2 + 40 | 0;
      r14 = r9;
      L1165 : while (1) {
        do {
          if ((HEAP32[r14 + 36 >> 2] | 0) != 0) {
            if ((HEAP32[r14 + 24 >> 2] | 0) != (HEAP32[r11 >> 2] | 0)) {
              break;
            }
            if (HEAP16[r14 + 28 >> 1] << 16 >> 16 != HEAP16[r12 >> 1] << 16 >> 16) {
              break;
            }
            if ((HEAP32[r14 + 16 >> 2] | 0) == (HEAPU8[r13] | HEAPU8[r13 + 1 | 0] << 8 | HEAPU8[r13 + 2 | 0] << 16 | HEAPU8[r13 + 3 | 0] << 24 | 0)) {
              r8 = 0;
              break L1165;
            }
          }
        } while (0);
        r15 = r14 + 380 | 0;
        r16 = HEAP32[r6];
        if (r15 >>> 0 < (r16 + (HEAP32[r10] * 380 & -1) | 0) >>> 0) {
          r14 = r15;
        } else {
          r17 = r16;
          break L1163;
        }
      }
      STACKTOP = r4;
      return r8;
    } else {
      r17 = r9;
    }
  } while (0);
  r9 = HEAP32[r6] + (HEAP32[r10] * 380 & -1) | 0;
  r14 = r17;
  while (1) {
    if (r14 >>> 0 >= r9 >>> 0) {
      break;
    }
    if ((HEAP32[r14 + 36 >> 2] | 0) == 0) {
      break;
    } else {
      r14 = r14 + 380 | 0;
    }
  }
  if (r14 >>> 0 >= (HEAP32[r6] + (HEAP32[r10] * 380 & -1) | 0) >>> 0) {
    r8 = 0;
    STACKTOP = r4;
    return r8;
  }
  r10 = HEAP32[r1 + 44 >> 2];
  r6 = r7 >>> 0 > r10 >>> 0 ? r10 : r7;
  r7 = _enet_malloc(r6 * 60 & -1);
  r10 = (r14 + 40 | 0) >> 2;
  HEAP32[r10] = r7;
  if ((r7 | 0) == 0) {
    r8 = 0;
    STACKTOP = r4;
    return r8;
  }
  HEAP32[r14 + 44 >> 2] = r6;
  HEAP32[r14 + 36 >> 2] = 2;
  r7 = r2 + 40 | 0;
  r9 = r14 + 16 | 0;
  HEAP32[r9 >> 2] = HEAPU8[r7] | HEAPU8[r7 + 1 | 0] << 8 | HEAPU8[r7 + 2 | 0] << 16 | HEAPU8[r7 + 3 | 0] << 24 | 0;
  r7 = r1 + 10348 | 0;
  r17 = r14 + 24 | 0;
  r13 = HEAP32[r7 + 4 >> 2];
  HEAP32[r17 >> 2] = HEAP32[r7 >> 2];
  HEAP32[r17 + 4 >> 2] = r13;
  r13 = r2 + 4 | 0;
  HEAP16[r14 + 12 >> 1] = _htons((tempInt = HEAPU8[r13] | HEAPU8[r13 + 1 | 0] << 8, tempInt << 16 >> 16));
  r13 = r2 + 20 | 0;
  r17 = (r14 + 48 | 0) >> 2;
  HEAP32[r17] = _htonl(HEAPU8[r13] | HEAPU8[r13 + 1 | 0] << 8 | HEAPU8[r13 + 2 | 0] << 16 | HEAPU8[r13 + 3 | 0] << 24 | 0);
  r13 = r2 + 24 | 0;
  HEAP32[r14 + 52 >> 2] = _htonl(HEAPU8[r13] | HEAPU8[r13 + 1 | 0] << 8 | HEAPU8[r13 + 2 | 0] << 16 | HEAPU8[r13 + 3 | 0] << 24 | 0);
  r13 = r2 + 28 | 0;
  r7 = r14 + 132 | 0;
  HEAP32[r7 >> 2] = _htonl(HEAPU8[r13] | HEAPU8[r13 + 1 | 0] << 8 | HEAPU8[r13 + 2 | 0] << 16 | HEAPU8[r13 + 3 | 0] << 24 | 0);
  r13 = r2 + 32 | 0;
  r12 = r14 + 124 | 0;
  HEAP32[r12 >> 2] = _htonl(HEAPU8[r13] | HEAPU8[r13 + 1 | 0] << 8 | HEAPU8[r13 + 2 | 0] << 16 | HEAPU8[r13 + 3 | 0] << 24 | 0);
  r13 = r2 + 36 | 0;
  r11 = r14 + 128 | 0;
  HEAP32[r11 >> 2] = _htonl(HEAPU8[r13] | HEAPU8[r13 + 1 | 0] << 8 | HEAPU8[r13 + 2 | 0] << 16 | HEAPU8[r13 + 3 | 0] << 24 | 0);
  r13 = r2 + 44 | 0;
  HEAP32[r14 + 376 >> 2] = _htonl(HEAPU8[r13] | HEAPU8[r13 + 1 | 0] << 8 | HEAPU8[r13 + 2 | 0] << 16 | HEAPU8[r13 + 3 | 0] << 24 | 0);
  r13 = HEAP8[r2 + 6 | 0];
  if (r13 << 24 >> 24 == -1) {
    r18 = HEAP8[r14 + 20 | 0];
  } else {
    r18 = r13;
  }
  r13 = r18 + 1 & 3;
  r16 = r14 + 20 | 0;
  if (r13 << 24 >> 24 == HEAP8[r16] << 24 >> 24) {
    r19 = r18 + 2 & 3;
  } else {
    r19 = r13;
  }
  HEAP8[r16] = r19;
  r16 = HEAP8[r2 + 7 | 0];
  if (r16 << 24 >> 24 == -1) {
    r20 = HEAP8[r14 + 21 | 0];
  } else {
    r20 = r16;
  }
  r16 = r20 + 1 & 3;
  r13 = r14 + 21 | 0;
  if (r16 << 24 >> 24 == HEAP8[r13] << 24 >> 24) {
    r21 = r20 + 2 & 3;
  } else {
    r21 = r16;
  }
  HEAP8[r13] = r21;
  L1196 : do {
    if ((r6 | 0) > 0) {
      r13 = HEAP32[r10], r16 = r13 >> 1;
      while (1) {
        HEAP16[r16] = 0;
        HEAP16[r16 + 1] = 0;
        HEAP16[r16 + 19] = 0;
        HEAP16[r16 + 20] = 0;
        _enet_list_clear(r13 + 44 | 0);
        _enet_list_clear(r13 + 52 | 0);
        r20 = r13 + 60 | 0;
        _memset(r13 + 4 | 0, 0, 34);
        if (r20 >>> 0 < (HEAP32[r10] + (r6 * 60 & -1) | 0) >>> 0) {
          r13 = r20, r16 = r13 >> 1;
        } else {
          break L1196;
        }
      }
    }
  } while (0);
  r10 = r2 + 8 | 0;
  r13 = _htonl(HEAPU8[r10] | HEAPU8[r10 + 1 | 0] << 8 | HEAPU8[r10 + 2 | 0] << 16 | HEAPU8[r10 + 3 | 0] << 24 | 0);
  if (r13 >>> 0 < 576) {
    r22 = 576;
  } else {
    r22 = r13 >>> 0 > 4096 ? 4096 : r13;
  }
  r13 = r14 + 176 | 0;
  HEAP32[r13 >> 2] = r22;
  r22 = (r1 + 16 | 0) >> 2;
  r10 = HEAP32[r22];
  do {
    if ((r10 | 0) == 0) {
      if ((HEAP32[r17] | 0) == 0) {
        HEAP32[r14 + 180 >> 2] = 32768;
        break;
      } else {
        r16 = HEAP32[r22];
        if ((r16 | 0) == 0) {
          r3 = 923;
          break;
        } else {
          r23 = r16;
          r3 = 922;
          break;
        }
      }
    } else {
      r23 = r10;
      r3 = 922;
    }
  } while (0);
  do {
    if (r3 == 922) {
      r10 = HEAP32[r17];
      if ((r10 | 0) == 0) {
        r3 = 923;
        break;
      }
      HEAP32[r14 + 180 >> 2] = (r23 >>> 0 < r10 >>> 0 ? r23 : r10) >>> 16 << 12;
      break;
    }
  } while (0);
  if (r3 == 923) {
    r3 = HEAP32[r22];
    r23 = HEAP32[r17];
    HEAP32[r14 + 180 >> 2] = (r3 >>> 0 > r23 >>> 0 ? r3 : r23) >>> 16 << 12;
  }
  r23 = (r14 + 180 | 0) >> 2;
  r3 = HEAP32[r23];
  do {
    if (r3 >>> 0 < 4096) {
      HEAP32[r23] = 4096;
    } else {
      if (r3 >>> 0 <= 32768) {
        break;
      }
      HEAP32[r23] = 32768;
    }
  } while (0);
  r23 = r1 + 12 | 0;
  r1 = HEAP32[r23 >> 2];
  if ((r1 | 0) == 0) {
    r24 = 32768;
  } else {
    r24 = r1 >>> 16 << 12;
  }
  r1 = r2 + 12 | 0;
  r2 = _htonl(HEAPU8[r1] | HEAPU8[r1 + 1 | 0] << 8 | HEAPU8[r1 + 2 | 0] << 16 | HEAPU8[r1 + 3 | 0] << 24 | 0);
  r1 = r24 >>> 0 > r2 >>> 0 ? r2 : r24;
  if (r1 >>> 0 < 4096) {
    r25 = 4096;
  } else {
    r25 = r1 >>> 0 > 32768 ? 32768 : r1;
  }
  HEAP8[r5 | 0] = -125;
  HEAP8[r5 + 1 | 0] = -1;
  r1 = r5 + 4 | 0;
  tempBigInt = _htons(HEAP16[r14 + 14 >> 1]);
  HEAP8[r1] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r1 + 1 | 0] = tempBigInt & 255;
  HEAP8[r5 + 6 | 0] = r19;
  HEAP8[r5 + 7 | 0] = r21;
  r21 = r5 + 8 | 0;
  tempBigInt = _htonl(HEAP32[r13 >> 2]);
  HEAP8[r21] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r21 + 1 | 0] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r21 + 2 | 0] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r21 + 3 | 0] = tempBigInt & 255;
  r21 = r5 + 12 | 0;
  tempBigInt = _htonl(r25);
  HEAP8[r21] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r21 + 1 | 0] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r21 + 2 | 0] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r21 + 3 | 0] = tempBigInt & 255;
  r21 = r5 + 16 | 0;
  tempBigInt = _htonl(r6);
  HEAP8[r21] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r21 + 1 | 0] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r21 + 2 | 0] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r21 + 3 | 0] = tempBigInt & 255;
  r21 = r5 + 20 | 0;
  tempBigInt = _htonl(HEAP32[r23 >> 2]);
  HEAP8[r21] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r21 + 1 | 0] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r21 + 2 | 0] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r21 + 3 | 0] = tempBigInt & 255;
  r21 = r5 + 24 | 0;
  tempBigInt = _htonl(HEAP32[r22]);
  HEAP8[r21] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r21 + 1 | 0] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r21 + 2 | 0] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r21 + 3 | 0] = tempBigInt & 255;
  r21 = r5 + 28 | 0;
  tempBigInt = _htonl(HEAP32[r7 >> 2]);
  HEAP8[r21] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r21 + 1 | 0] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r21 + 2 | 0] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r21 + 3 | 0] = tempBigInt & 255;
  r21 = r5 + 32 | 0;
  tempBigInt = _htonl(HEAP32[r12 >> 2]);
  HEAP8[r21] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r21 + 1 | 0] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r21 + 2 | 0] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r21 + 3 | 0] = tempBigInt & 255;
  r21 = r5 + 36 | 0;
  tempBigInt = _htonl(HEAP32[r11 >> 2]);
  HEAP8[r21] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r21 + 1 | 0] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r21 + 2 | 0] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r21 + 3 | 0] = tempBigInt & 255;
  r21 = r5 + 40 | 0;
  tempBigInt = HEAP32[r9 >> 2];
  HEAP8[r21] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r21 + 1 | 0] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r21 + 2 | 0] = tempBigInt & 255;
  tempBigInt = tempBigInt >> 8;
  HEAP8[r21 + 3 | 0] = tempBigInt & 255;
  _enet_peer_queue_outgoing_command(r14, r5, 0, 0, 0);
  r8 = r14;
  STACKTOP = r4;
  return r8;
}
function _enet_protocol_handle_verify_connect(r1, r2, r3, r4) {
  var r5, r6, r7, r8, r9;
  if ((HEAP32[r3 + 36 >> 2] | 0) != 1) {
    r5 = 0;
    return r5;
  }
  r6 = r4 + 16 | 0;
  r7 = _htonl(HEAPU8[r6] | HEAPU8[r6 + 1 | 0] << 8 | HEAPU8[r6 + 2 | 0] << 16 | HEAPU8[r6 + 3 | 0] << 24 | 0);
  do {
    if (!((r7 | 0) == 0 | r7 >>> 0 > 255)) {
      r6 = r4 + 28 | 0;
      if ((_htonl(HEAPU8[r6] | HEAPU8[r6 + 1 | 0] << 8 | HEAPU8[r6 + 2 | 0] << 16 | HEAPU8[r6 + 3 | 0] << 24 | 0) | 0) != (HEAP32[r3 + 132 >> 2] | 0)) {
        break;
      }
      r6 = r4 + 32 | 0;
      if ((_htonl(HEAPU8[r6] | HEAPU8[r6 + 1 | 0] << 8 | HEAPU8[r6 + 2 | 0] << 16 | HEAPU8[r6 + 3 | 0] << 24 | 0) | 0) != (HEAP32[r3 + 124 >> 2] | 0)) {
        break;
      }
      r6 = r4 + 36 | 0;
      if ((_htonl(HEAPU8[r6] | HEAPU8[r6 + 1 | 0] << 8 | HEAPU8[r6 + 2 | 0] << 16 | HEAPU8[r6 + 3 | 0] << 24 | 0) | 0) != (HEAP32[r3 + 128 >> 2] | 0)) {
        break;
      }
      r6 = r4 + 40 | 0;
      if ((HEAPU8[r6] | HEAPU8[r6 + 1 | 0] << 8 | HEAPU8[r6 + 2 | 0] << 16 | HEAPU8[r6 + 3 | 0] << 24 | 0) != (HEAP32[r3 + 16 >> 2] | 0)) {
        break;
      }
      _enet_protocol_remove_sent_reliable_command(r3, 1, -1);
      r6 = r3 + 44 | 0;
      if (r7 >>> 0 < HEAP32[r6 >> 2] >>> 0) {
        HEAP32[r6 >> 2] = r7;
      }
      r6 = r4 + 4 | 0;
      HEAP16[r3 + 12 >> 1] = _htons((tempInt = HEAPU8[r6] | HEAPU8[r6 + 1 | 0] << 8, tempInt << 16 >> 16));
      HEAP8[r3 + 21 | 0] = HEAP8[r4 + 6 | 0];
      HEAP8[r3 + 20 | 0] = HEAP8[r4 + 7 | 0];
      r6 = r4 + 8 | 0;
      r8 = _htonl(HEAPU8[r6] | HEAPU8[r6 + 1 | 0] << 8 | HEAPU8[r6 + 2 | 0] << 16 | HEAPU8[r6 + 3 | 0] << 24 | 0);
      if (r8 >>> 0 < 576) {
        r9 = 576;
      } else {
        r9 = r8 >>> 0 > 4096 ? 4096 : r8;
      }
      r8 = r3 + 176 | 0;
      if (r9 >>> 0 < HEAP32[r8 >> 2] >>> 0) {
        HEAP32[r8 >> 2] = r9;
      }
      r8 = r4 + 12 | 0;
      r6 = _htonl(HEAPU8[r8] | HEAPU8[r8 + 1 | 0] << 8 | HEAPU8[r8 + 2 | 0] << 16 | HEAPU8[r8 + 3 | 0] << 24 | 0);
      r8 = r6 >>> 0 < 4096 ? 4096 : r6;
      r6 = r8 >>> 0 > 32768 ? 32768 : r8;
      r8 = r3 + 180 | 0;
      if (r6 >>> 0 < HEAP32[r8 >> 2] >>> 0) {
        HEAP32[r8 >> 2] = r6;
      }
      r6 = r4 + 20 | 0;
      HEAP32[r3 + 48 >> 2] = _htonl(HEAPU8[r6] | HEAPU8[r6 + 1 | 0] << 8 | HEAPU8[r6 + 2 | 0] << 16 | HEAPU8[r6 + 3 | 0] << 24 | 0);
      r6 = r4 + 24 | 0;
      HEAP32[r3 + 52 >> 2] = _htonl(HEAPU8[r6] | HEAPU8[r6 + 1 | 0] << 8 | HEAPU8[r6 + 2 | 0] << 16 | HEAPU8[r6 + 3 | 0] << 24 | 0);
      _enet_protocol_notify_connect(r1, r3, r2);
      r5 = 0;
      return r5;
    }
  } while (0);
  HEAP32[r3 + 376 >> 2] = 0;
  _enet_protocol_dispatch_state(r1, r3, 9);
  r5 = -1;
  return r5;
}
function _enet_protocol_handle_disconnect(r1, r2, r3) {
  var r4, r5, r6;
  r4 = 0;
  r5 = (r2 + 36 | 0) >> 2;
  if ((HEAP32[r5] - 8 | 0) >>> 0 < 2) {
    return;
  }
  _enet_peer_reset_queues(r2);
  r6 = HEAP32[r5];
  do {
    if ((r6 | 0) == 4 | (r6 | 0) == 7) {
      _enet_protocol_dispatch_state(r1, r2, 9);
      r4 = 968;
      break;
    } else if ((r6 | 0) == 5 | (r6 | 0) == 6) {
      if (HEAP8[r3 | 0] << 24 >> 24 < 0) {
        HEAP32[r5] = 8;
        break;
      } else {
        _enet_protocol_dispatch_state(r1, r2, 9);
        r4 = 968;
        break;
      }
    } else if ((r6 | 0) == 3) {
      HEAP32[r1 + 32 >> 2] = 1;
      r4 = 964;
      break;
    } else {
      r4 = 964;
    }
  } while (0);
  do {
    if (r4 == 964) {
      _enet_peer_reset(r2);
      r4 = 968;
      break;
    }
  } while (0);
  do {
    if (r4 == 968) {
      if ((HEAP32[r5] | 0) != 0) {
        break;
      }
      return;
    }
  } while (0);
  r5 = r3 + 4 | 0;
  HEAP32[r2 + 376 >> 2] = _htonl(HEAPU8[r5] | HEAPU8[r5 + 1 | 0] << 8 | HEAPU8[r5 + 2 | 0] << 16 | HEAPU8[r5 + 3 | 0] << 24 | 0);
  return;
}
function _enet_protocol_handle_send_reliable(r1, r2, r3, r4) {
  var r5, r6;
  if (HEAPU8[r3 + 1 | 0] >>> 0 >= HEAP32[r2 + 44 >> 2] >>> 0) {
    return -1;
  }
  if ((HEAP32[r2 + 36 >> 2] - 5 | 0) >>> 0 >= 2) {
    return -1;
  }
  r5 = r3 + 4 | 0;
  r6 = _htons((tempInt = HEAPU8[r5] | HEAPU8[r5 + 1 | 0] << 8, tempInt << 16 >> 16)) & 65535;
  r5 = HEAP32[r4 >> 2] + r6 | 0;
  HEAP32[r4 >> 2] = r5;
  r4 = HEAP32[r1 + 10356 >> 2];
  if (r5 >>> 0 < r4 >>> 0) {
    return -1;
  }
  if (r5 >>> 0 > (r4 + HEAP32[r1 + 10360 >> 2] | 0) >>> 0) {
    return -1;
  }
  r1 = _enet_packet_create(r3 + 6 | 0, r6, 1);
  if ((r1 | 0) == 0) {
    return -1;
  } else {
    return ((_enet_peer_queue_incoming_command(r2, r3, r1, 0) | 0) == 0) << 31 >> 31;
  }
}
function _enet_protocol_handle_send_unreliable(r1, r2, r3, r4) {
  var r5, r6;
  if (HEAPU8[r3 + 1 | 0] >>> 0 >= HEAP32[r2 + 44 >> 2] >>> 0) {
    return -1;
  }
  if ((HEAP32[r2 + 36 >> 2] - 5 | 0) >>> 0 >= 2) {
    return -1;
  }
  r5 = r3 + 6 | 0;
  r6 = _htons((tempInt = HEAPU8[r5] | HEAPU8[r5 + 1 | 0] << 8, tempInt << 16 >> 16)) & 65535;
  r5 = HEAP32[r4 >> 2] + r6 | 0;
  HEAP32[r4 >> 2] = r5;
  r4 = HEAP32[r1 + 10356 >> 2];
  if (r5 >>> 0 < r4 >>> 0) {
    return -1;
  }
  if (r5 >>> 0 > (r4 + HEAP32[r1 + 10360 >> 2] | 0) >>> 0) {
    return -1;
  }
  r1 = _enet_packet_create(r3 + 8 | 0, r6, 0);
  if ((r1 | 0) == 0) {
    return -1;
  } else {
    return ((_enet_peer_queue_incoming_command(r2, r3, r1, 0) | 0) == 0) << 31 >> 31;
  }
}
function _enet_protocol_handle_send_unsequenced(r1, r2, r3, r4) {
  var r5, r6, r7, r8, r9, r10;
  if (HEAPU8[r3 + 1 | 0] >>> 0 >= HEAP32[r2 + 44 >> 2] >>> 0) {
    r5 = -1;
    return r5;
  }
  if ((HEAP32[r2 + 36 >> 2] - 5 | 0) >>> 0 >= 2) {
    r5 = -1;
    return r5;
  }
  r6 = r3 + 6 | 0;
  r7 = _htons((tempInt = HEAPU8[r6] | HEAPU8[r6 + 1 | 0] << 8, tempInt << 16 >> 16)) & 65535;
  r6 = HEAP32[r4 >> 2] + r7 | 0;
  HEAP32[r4 >> 2] = r6;
  r4 = HEAP32[r1 + 10356 >> 2];
  if (r6 >>> 0 < r4 >>> 0) {
    r5 = -1;
    return r5;
  }
  if (r6 >>> 0 > (r4 + HEAP32[r1 + 10360 >> 2] | 0) >>> 0) {
    r5 = -1;
    return r5;
  }
  r1 = r3 + 4 | 0;
  r4 = _htons((tempInt = HEAPU8[r1] | HEAPU8[r1 + 1 | 0] << 8, tempInt << 16 >> 16));
  r1 = r4 & 65535;
  r6 = r1 & 1023;
  r8 = r2 + 244 | 0;
  r9 = HEAP16[r8 >> 1];
  r10 = (r4 & 65535) < (r9 & 65535) ? r1 | 65536 : r1;
  r4 = r9 & 65535;
  if (r10 >>> 0 >= (r4 + 32768 | 0) >>> 0) {
    r5 = 0;
    return r5;
  }
  r9 = (r10 & 65535) - r6 | 0;
  do {
    if ((r9 | 0) == (r4 | 0)) {
      if ((HEAP32[r2 + (r6 >>> 5 << 2) + 248 >> 2] & 1 << (r1 & 31) | 0) == 0) {
        break;
      } else {
        r5 = 0;
      }
      return r5;
    } else {
      HEAP16[r8 >> 1] = r9 & 65535;
      _memset(r2 + 248 | 0, 0, 128);
    }
  } while (0);
  r9 = _enet_packet_create(r3 + 8 | 0, r7, 2);
  if ((r9 | 0) == 0) {
    r5 = -1;
    return r5;
  }
  if ((_enet_peer_queue_incoming_command(r2, r3, r9, 0) | 0) == 0) {
    r5 = -1;
    return r5;
  }
  r9 = (r6 >>> 5 << 2) + r2 + 248 | 0;
  HEAP32[r9 >> 2] = HEAP32[r9 >> 2] | 1 << (r1 & 31);
  r5 = 0;
  return r5;
}
function _enet_protocol_handle_send_fragment(r1, r2, r3, r4) {
  var r5, r6, r7, r8, r9, r10, r11, r12, r13, r14, r15, r16, r17, r18, r19, r20, r21, r22, r23, r24, r25;
  r5 = 0;
  r6 = STACKTOP;
  STACKTOP = STACKTOP + 48 | 0;
  r7 = r6;
  r8 = r3 + 1 | 0;
  if (HEAPU8[r8] >>> 0 >= HEAP32[r2 + 44 >> 2] >>> 0) {
    r9 = -1;
    STACKTOP = r6;
    return r9;
  }
  if ((HEAP32[r2 + 36 >> 2] - 5 | 0) >>> 0 >= 2) {
    r9 = -1;
    STACKTOP = r6;
    return r9;
  }
  r10 = r3 + 6 | 0;
  r11 = _htons((tempInt = HEAPU8[r10] | HEAPU8[r10 + 1 | 0] << 8, tempInt << 16 >> 16)) & 65535;
  r10 = HEAP32[r4 >> 2] + r11 | 0;
  HEAP32[r4 >> 2] = r10;
  r4 = HEAP32[r1 + 10356 >> 2];
  if (r10 >>> 0 < r4 >>> 0) {
    r9 = -1;
    STACKTOP = r6;
    return r9;
  }
  if (r10 >>> 0 > (r4 + HEAP32[r1 + 10360 >> 2] | 0) >>> 0) {
    r9 = -1;
    STACKTOP = r6;
    return r9;
  }
  r1 = HEAPU8[r8];
  r8 = HEAP32[r2 + 40 >> 2];
  r4 = r8 + (r1 * 60 & -1) | 0;
  r10 = r3 + 4 | 0;
  r12 = _htons((tempInt = HEAPU8[r10] | HEAPU8[r10 + 1 | 0] << 8, tempInt << 16 >> 16));
  r10 = (r12 & 65535) >>> 12;
  r13 = r8 + (r1 * 60 & -1) + 38 | 0;
  r14 = HEAP16[r13 >> 1];
  r15 = (r14 & 65535) >>> 12;
  r16 = (r12 & 65535) < (r14 & 65535) ? r10 | 16 : r10;
  if ((r16 & 65535) < (r15 & 65535)) {
    r9 = 0;
    STACKTOP = r6;
    return r9;
  }
  if ((r16 & 65535) >>> 0 >= ((r15 & 65535) + 7 | 0) >>> 0) {
    r9 = 0;
    STACKTOP = r6;
    return r9;
  }
  r15 = r3 + 12 | 0;
  r16 = _htonl(HEAPU8[r15] | HEAPU8[r15 + 1 | 0] << 8 | HEAPU8[r15 + 2 | 0] << 16 | HEAPU8[r15 + 3 | 0] << 24 | 0);
  r15 = r3 + 8 | 0;
  r10 = _htonl(HEAPU8[r15] | HEAPU8[r15 + 1 | 0] << 8 | HEAPU8[r15 + 2 | 0] << 16 | HEAPU8[r15 + 3 | 0] << 24 | 0);
  r15 = r3 + 20 | 0;
  r14 = _htonl(HEAPU8[r15] | HEAPU8[r15 + 1 | 0] << 8 | HEAPU8[r15 + 2 | 0] << 16 | HEAPU8[r15 + 3 | 0] << 24 | 0);
  r15 = r3 + 16 | 0;
  r17 = _htonl(HEAPU8[r15] | HEAPU8[r15 + 1 | 0] << 8 | HEAPU8[r15 + 2 | 0] << 16 | HEAPU8[r15 + 3 | 0] << 24 | 0);
  if (r16 >>> 0 >= r10 >>> 0 | r10 >>> 0 > 1048576 | r17 >>> 0 > 1073741824 | r14 >>> 0 >= r17 >>> 0 | r11 >>> 0 > (r17 - r14 | 0) >>> 0) {
    r9 = -1;
    STACKTOP = r6;
    return r9;
  }
  r15 = r8 + (r1 * 60 & -1) + 44 | 0;
  r18 = HEAP32[r8 + (r1 * 60 & -1) + 48 >> 2];
  L1352 : do {
    if ((r18 | 0) == (r15 | 0)) {
      r5 = 1038;
    } else {
      r1 = HEAP16[r13 >> 1];
      r8 = (r12 & 65535) < (r1 & 65535);
      r19 = r18, r20 = r19 >> 2;
      while (1) {
        r21 = r19;
        r22 = r19 + 8 | 0;
        r23 = HEAPU16[r22 >> 1] < (r1 & 65535);
        do {
          if (r8) {
            if (r23) {
              r5 = 1031;
              break;
            } else {
              r5 = 1038;
              break L1352;
            }
          } else {
            if (r23) {
              break;
            } else {
              r5 = 1031;
              break;
            }
          }
        } while (0);
        if (r5 == 1031) {
          r5 = 0;
          r24 = HEAP16[r22 >> 1];
          if ((r24 & 65535) <= (r12 & 65535)) {
            break;
          }
        }
        r23 = HEAP32[r20 + 1];
        if ((r23 | 0) == (r15 | 0)) {
          r5 = 1038;
          break L1352;
        } else {
          r19 = r23, r20 = r19 >> 2;
        }
      }
      if ((r24 & 65535) < (r12 & 65535)) {
        r5 = 1038;
        break;
      }
      if ((HEAP8[r19 + 12 | 0] & 15) << 24 >> 24 != 8) {
        r9 = -1;
        STACKTOP = r6;
        return r9;
      }
      if ((r17 | 0) != (HEAP32[HEAP32[r20 + 18] + 12 >> 2] | 0)) {
        r9 = -1;
        STACKTOP = r6;
        return r9;
      }
      if ((r10 | 0) == (HEAP32[r20 + 15] | 0)) {
        if ((r19 | 0) == 0) {
          r5 = 1038;
          break;
        } else {
          r25 = r21;
          break;
        }
      } else {
        r9 = -1;
        STACKTOP = r6;
        return r9;
      }
    }
  } while (0);
  do {
    if (r5 == 1038) {
      _memcpy(r7 | 0, r3 | 0, 48);
      r21 = _enet_packet_create(0, r17, 1);
      if ((r21 | 0) == 0) {
        r9 = -1;
        STACKTOP = r6;
        return r9;
      }
      r24 = r7 + 2 | 0;
      tempBigInt = r12;
      HEAP8[r24] = tempBigInt & 255;
      tempBigInt = tempBigInt >> 8;
      HEAP8[r24 + 1 | 0] = tempBigInt & 255;
      r24 = _enet_peer_queue_incoming_command(r2, r7, r21, r10);
      if ((r24 | 0) == 0) {
        r9 = -1;
      } else {
        r25 = r24;
        break;
      }
      STACKTOP = r6;
      return r9;
    }
  } while (0);
  r10 = r16 >>> 5;
  r7 = r25 + 68 | 0;
  r12 = 1 << (r16 & 31);
  if ((HEAP32[HEAP32[r7 >> 2] + (r10 << 2) >> 2] & r12 | 0) != 0) {
    r9 = 0;
    STACKTOP = r6;
    return r9;
  }
  r16 = (r25 + 64 | 0) >> 2;
  HEAP32[r16] = HEAP32[r16] - 1 | 0;
  r17 = (r10 << 2) + HEAP32[r7 >> 2] | 0;
  HEAP32[r17 >> 2] = HEAP32[r17 >> 2] | r12;
  r12 = HEAP32[r25 + 72 >> 2];
  r25 = HEAP32[r12 + 12 >> 2];
  _memcpy(HEAP32[r12 + 8 >> 2] + r14 | 0, r3 + 24 | 0, (r14 + r11 | 0) >>> 0 > r25 >>> 0 ? r25 - r14 | 0 : r11);
  if ((HEAP32[r16] | 0) != 0) {
    r9 = 0;
    STACKTOP = r6;
    return r9;
  }
  _enet_peer_dispatch_incoming_reliable_commands(r2, r4);
  r9 = 0;
  STACKTOP = r6;
  return r9;
}
function _enet_protocol_handle_bandwidth_limit(r1, r2, r3) {
  var r4, r5, r6;
  r4 = 0;
  r5 = r3 + 4 | 0;
  r6 = (r2 + 48 | 0) >> 2;
  HEAP32[r6] = _htonl(HEAPU8[r5] | HEAPU8[r5 + 1 | 0] << 8 | HEAPU8[r5 + 2 | 0] << 16 | HEAPU8[r5 + 3 | 0] << 24 | 0);
  r5 = r3 + 8 | 0;
  HEAP32[r2 + 52 >> 2] = _htonl(HEAPU8[r5] | HEAPU8[r5 + 1 | 0] << 8 | HEAPU8[r5 + 2 | 0] << 16 | HEAPU8[r5 + 3 | 0] << 24 | 0);
  do {
    if ((HEAP32[r6] | 0) == 0) {
      if ((HEAP32[r1 + 16 >> 2] | 0) != 0) {
        r4 = 1062;
        break;
      }
      HEAP32[r2 + 180 >> 2] = 32768;
      break;
    } else {
      r4 = 1062;
    }
  } while (0);
  if (r4 == 1062) {
    r4 = HEAP32[r6];
    r6 = HEAP32[r1 + 16 >> 2];
    HEAP32[r2 + 180 >> 2] = (r4 >>> 0 < r6 >>> 0 ? r4 : r6) >>> 16 << 12;
  }
  r6 = (r2 + 180 | 0) >> 2;
  r2 = HEAP32[r6];
  if (r2 >>> 0 < 4096) {
    HEAP32[r6] = 4096;
    return;
  }
  if (r2 >>> 0 <= 32768) {
    return;
  }
  HEAP32[r6] = 32768;
  return;
}
function _enet_protocol_handle_throttle_configure(r1, r2) {
  var r3;
  r3 = r2 + 4 | 0;
  HEAP32[r1 + 132 >> 2] = _htonl(HEAPU8[r3] | HEAPU8[r3 + 1 | 0] << 8 | HEAPU8[r3 + 2 | 0] << 16 | HEAPU8[r3 + 3 | 0] << 24 | 0);
  r3 = r2 + 8 | 0;
  HEAP32[r1 + 124 >> 2] = _htonl(HEAPU8[r3] | HEAPU8[r3 + 1 | 0] << 8 | HEAPU8[r3 + 2 | 0] << 16 | HEAPU8[r3 + 3 | 0] << 24 | 0);
  r3 = r2 + 12 | 0;
  HEAP32[r1 + 128 >> 2] = _htonl(HEAPU8[r3] | HEAPU8[r3 + 1 | 0] << 8 | HEAPU8[r3 + 2 | 0] << 16 | HEAPU8[r3 + 3 | 0] << 24 | 0);
  return;
}
function _enet_protocol_handle_send_unreliable_fragment(r1, r2, r3, r4) {
  var r5, r6, r7, r8, r9, r10, r11, r12, r13, r14, r15, r16, r17, r18, r19, r20, r21, r22, r23, r24;
  r5 = 0;
  r6 = r3 + 1 | 0;
  if (HEAPU8[r6] >>> 0 >= HEAP32[r2 + 44 >> 2] >>> 0) {
    r7 = -1;
    return r7;
  }
  if ((HEAP32[r2 + 36 >> 2] - 5 | 0) >>> 0 >= 2) {
    r7 = -1;
    return r7;
  }
  r8 = r3 + 6 | 0;
  r9 = _htons((tempInt = HEAPU8[r8] | HEAPU8[r8 + 1 | 0] << 8, tempInt << 16 >> 16)) & 65535;
  r8 = HEAP32[r4 >> 2] + r9 | 0;
  HEAP32[r4 >> 2] = r8;
  r4 = HEAP32[r1 + 10356 >> 2];
  if (r8 >>> 0 < r4 >>> 0) {
    r7 = -1;
    return r7;
  }
  if (r8 >>> 0 > (r4 + HEAP32[r1 + 10360 >> 2] | 0) >>> 0) {
    r7 = -1;
    return r7;
  }
  r1 = HEAPU8[r6];
  r6 = HEAP32[r2 + 40 >> 2];
  r4 = r6 + (r1 * 60 & -1) | 0;
  r8 = r3 + 2 | 0;
  r10 = (tempInt = HEAPU8[r8] | HEAPU8[r8 + 1 | 0] << 8, tempInt << 16 >> 16);
  r8 = r3 + 4 | 0;
  r11 = _htons((tempInt = HEAPU8[r8] | HEAPU8[r8 + 1 | 0] << 8, tempInt << 16 >> 16));
  r8 = (r10 & 65535) >>> 12;
  r12 = r6 + (r1 * 60 & -1) + 38 | 0;
  r13 = HEAP16[r12 >> 1];
  r14 = (r13 & 65535) >>> 12;
  r15 = (r10 & 65535) < (r13 & 65535) ? r8 | 16 : r8;
  if ((r15 & 65535) < (r14 & 65535)) {
    r7 = 0;
    return r7;
  }
  if ((r15 & 65535) >>> 0 >= ((r14 & 65535) + 7 | 0) >>> 0) {
    r7 = 0;
    return r7;
  }
  do {
    if (r10 << 16 >> 16 == r13 << 16 >> 16) {
      if ((r11 & 65535) > HEAPU16[r6 + (r1 * 60 & -1) + 40 >> 1]) {
        break;
      } else {
        r7 = 0;
      }
      return r7;
    }
  } while (0);
  r13 = r3 + 12 | 0;
  r14 = _htonl(HEAPU8[r13] | HEAPU8[r13 + 1 | 0] << 8 | HEAPU8[r13 + 2 | 0] << 16 | HEAPU8[r13 + 3 | 0] << 24 | 0);
  r13 = r3 + 8 | 0;
  r15 = _htonl(HEAPU8[r13] | HEAPU8[r13 + 1 | 0] << 8 | HEAPU8[r13 + 2 | 0] << 16 | HEAPU8[r13 + 3 | 0] << 24 | 0);
  r13 = r3 + 20 | 0;
  r8 = _htonl(HEAPU8[r13] | HEAPU8[r13 + 1 | 0] << 8 | HEAPU8[r13 + 2 | 0] << 16 | HEAPU8[r13 + 3 | 0] << 24 | 0);
  r13 = r3 + 16 | 0;
  r16 = _htonl(HEAPU8[r13] | HEAPU8[r13 + 1 | 0] << 8 | HEAPU8[r13 + 2 | 0] << 16 | HEAPU8[r13 + 3 | 0] << 24 | 0);
  if (r14 >>> 0 >= r15 >>> 0 | r15 >>> 0 > 1048576 | r16 >>> 0 > 1073741824 | r8 >>> 0 >= r16 >>> 0 | r9 >>> 0 > (r16 - r8 | 0) >>> 0) {
    r7 = -1;
    return r7;
  }
  r13 = r6 + (r1 * 60 & -1) + 52 | 0;
  r17 = HEAP32[r6 + (r1 * 60 & -1) + 56 >> 2];
  L1429 : do {
    if ((r17 | 0) == (r13 | 0)) {
      r5 = 1095;
    } else {
      r1 = HEAP16[r12 >> 1];
      r6 = (r10 & 65535) < (r1 & 65535);
      r18 = r17, r19 = r18 >> 2;
      L1431 : while (1) {
        r20 = r18;
        r21 = r18 + 8 | 0;
        r22 = HEAPU16[r21 >> 1] < (r1 & 65535);
        do {
          if (r6) {
            if (r22) {
              r5 = 1086;
              break;
            } else {
              r5 = 1095;
              break L1429;
            }
          } else {
            if (r22) {
              break;
            } else {
              r5 = 1086;
              break;
            }
          }
        } while (0);
        do {
          if (r5 == 1086) {
            r5 = 0;
            r22 = HEAP16[r21 >> 1];
            if ((r22 & 65535) < (r10 & 65535)) {
              r5 = 1095;
              break L1429;
            }
            if ((r22 & 65535) > (r10 & 65535)) {
              break;
            }
            r23 = HEAP16[r20 + 10 >> 1];
            if ((r23 & 65535) <= (r11 & 65535)) {
              break L1431;
            }
          }
        } while (0);
        r21 = HEAP32[r19 + 1];
        if ((r21 | 0) == (r13 | 0)) {
          r5 = 1095;
          break L1429;
        } else {
          r18 = r21, r19 = r18 >> 2;
        }
      }
      if ((r23 & 65535) < (r11 & 65535)) {
        r5 = 1095;
        break;
      }
      if ((HEAP8[r18 + 12 | 0] & 15) << 24 >> 24 != 12) {
        r7 = -1;
        return r7;
      }
      if ((r16 | 0) != (HEAP32[HEAP32[r19 + 18] + 12 >> 2] | 0)) {
        r7 = -1;
        return r7;
      }
      if ((r15 | 0) == (HEAP32[r19 + 15] | 0)) {
        if ((r18 | 0) == 0) {
          r5 = 1095;
          break;
        } else {
          r24 = r20;
          break;
        }
      } else {
        r7 = -1;
        return r7;
      }
    }
  } while (0);
  do {
    if (r5 == 1095) {
      r20 = _enet_packet_create(0, r16, 8);
      if ((r20 | 0) == 0) {
        r7 = -1;
        return r7;
      }
      r11 = _enet_peer_queue_incoming_command(r2, r3, r20, r15);
      if ((r11 | 0) == 0) {
        r7 = -1;
      } else {
        r24 = r11;
        break;
      }
      return r7;
    }
  } while (0);
  r15 = r14 >>> 5;
  r16 = r24 + 68 | 0;
  r5 = 1 << (r14 & 31);
  if ((HEAP32[HEAP32[r16 >> 2] + (r15 << 2) >> 2] & r5 | 0) != 0) {
    r7 = 0;
    return r7;
  }
  r14 = (r24 + 64 | 0) >> 2;
  HEAP32[r14] = HEAP32[r14] - 1 | 0;
  r11 = (r15 << 2) + HEAP32[r16 >> 2] | 0;
  HEAP32[r11 >> 2] = HEAP32[r11 >> 2] | r5;
  r5 = HEAP32[r24 + 72 >> 2];
  r24 = HEAP32[r5 + 12 >> 2];
  _memcpy(HEAP32[r5 + 8 >> 2] + r8 | 0, r3 + 24 | 0, (r8 + r9 | 0) >>> 0 > r24 >>> 0 ? r24 - r8 | 0 : r9);
  if ((HEAP32[r14] | 0) != 0) {
    r7 = 0;
    return r7;
  }
  _enet_peer_dispatch_incoming_unreliable_commands(r2, r4);
  r7 = 0;
  return r7;
}
function _enet_protocol_dispatch_state(r1, r2, r3) {
  HEAP32[r2 + 36 >> 2] = r3;
  r3 = r2 + 240 | 0;
  if ((HEAP32[r3 >> 2] | 0) != 0) {
    return;
  }
  _enet_list_insert(r1 + 52 | 0, r2);
  HEAP32[r3 >> 2] = 1;
  return;
}
function _enet_protocol_remove_sent_reliable_command(r1, r2, r3) {
  var r4, r5, r6, r7, r8, r9, r10, r11, r12, r13;
  r4 = 0;
  r5 = r1 + 200 | 0;
  r6 = r5 | 0;
  r7 = HEAP32[r6 >> 2];
  L1472 : do {
    if ((r7 | 0) == (r5 | 0)) {
      r4 = 1127;
    } else {
      r8 = r7;
      while (1) {
        if (HEAP16[r8 + 8 >> 1] << 16 >> 16 == r2 << 16 >> 16) {
          if (HEAP8[r8 + 33 | 0] << 24 >> 24 == r3 << 24 >> 24) {
            break;
          }
        }
        r9 = HEAP32[r8 >> 2];
        if ((r9 | 0) == (r5 | 0)) {
          r4 = 1127;
          break L1472;
        } else {
          r8 = r9;
        }
      }
      r10 = r8;
      r11 = 1;
      break;
    }
  } while (0);
  L1479 : do {
    if (r4 == 1127) {
      r7 = r1 + 216 | 0;
      r9 = HEAP32[r7 >> 2];
      if ((r9 | 0) == (r7 | 0)) {
        r12 = 0;
        return r12;
      } else {
        r13 = r9;
      }
      while (1) {
        r9 = r13;
        if (HEAP16[r9 + 30 >> 1] << 16 >> 16 == 0) {
          r12 = 0;
          r4 = 1149;
          break;
        }
        if (HEAP16[r13 + 8 >> 1] << 16 >> 16 == r2 << 16 >> 16) {
          if (HEAP8[r13 + 33 | 0] << 24 >> 24 == r3 << 24 >> 24) {
            r10 = r9;
            r11 = 0;
            break L1479;
          }
        }
        r9 = HEAP32[r13 >> 2];
        if ((r9 | 0) == (r7 | 0)) {
          r12 = 0;
          r4 = 1145;
          break;
        } else {
          r13 = r9;
        }
      }
      if (r4 == 1145) {
        return r12;
      } else if (r4 == 1149) {
        return r12;
      }
    }
  } while (0);
  if ((r10 | 0) == 0) {
    r12 = 0;
    return r12;
  }
  r4 = r3 & 255;
  do {
    if (r4 >>> 0 < HEAP32[r1 + 44 >> 2] >>> 0) {
      r3 = HEAP32[r1 + 40 >> 2];
      r13 = (r2 & 65535) >>> 12 & 65535;
      r7 = (r13 << 1) + r3 + (r4 * 60 & -1) + 6 | 0;
      r8 = HEAP16[r7 >> 1];
      if (r8 << 16 >> 16 == 0) {
        break;
      }
      r9 = r8 - 1 & 65535;
      HEAP16[r7 >> 1] = r9;
      if (r9 << 16 >> 16 != 0) {
        break;
      }
      r9 = r3 + (r4 * 60 & -1) + 4 | 0;
      HEAP16[r9 >> 1] = HEAPU16[r9 >> 1] & (1 << r13 ^ 65535) & 65535;
    }
  } while (0);
  r4 = HEAP8[r10 + 32 | 0] & 15;
  _enet_list_remove(r10 | 0);
  r2 = (r10 + 80 | 0) >> 2;
  do {
    if ((HEAP32[r2] | 0) != 0) {
      if ((r11 | 0) != 0) {
        r13 = r1 + 184 | 0;
        HEAP32[r13 >> 2] = HEAP32[r13 >> 2] - HEAPU16[r10 + 28 >> 1] | 0;
      }
      r13 = HEAP32[r2] | 0;
      HEAP32[r13 >> 2] = HEAP32[r13 >> 2] - 1 | 0;
      r13 = HEAP32[r2];
      if ((HEAP32[r13 >> 2] | 0) != 0) {
        break;
      }
      _enet_packet_destroy(r13);
    }
  } while (0);
  _enet_free(r10);
  r10 = HEAP32[r6 >> 2];
  if ((r10 | 0) == (r5 | 0)) {
    r12 = r4;
    return r12;
  }
  HEAP32[r1 + 80 >> 2] = HEAP32[r10 + 16 >> 2] + HEAP32[r10 + 12 >> 2] | 0;
  r12 = r4;
  return r12;
}
function _enet_protocol_notify_connect(r1, r2, r3) {
  var r4;
  HEAP32[r1 + 32 >> 2] = 1;
  r4 = r2 + 36 | 0;
  if ((r3 | 0) == 0) {
    _enet_protocol_dispatch_state(r1, r2, (HEAP32[r4 >> 2] | 0) == 1 ? 4 : 3);
    return;
  } else {
    HEAP32[r4 >> 2] = 5;
    HEAP32[r3 >> 2] = 1;
    HEAP32[r3 + 4 >> 2] = r2;
    HEAP32[r3 + 12 >> 2] = HEAP32[r2 + 376 >> 2];
    return;
  }
}
function _enet_protocol_notify_disconnect(r1, r2, r3) {
  var r4, r5;
  r4 = r2 + 36 | 0;
  if (HEAP32[r4 >> 2] >>> 0 > 2) {
    HEAP32[r1 + 32 >> 2] = 1;
  }
  r5 = HEAP32[r4 >> 2];
  if ((r5 | 0) != 1 & r5 >>> 0 < 4) {
    _enet_peer_reset(r2);
    return;
  }
  if ((r3 | 0) == 0) {
    HEAP32[r2 + 376 >> 2] = 0;
    _enet_protocol_dispatch_state(r1, r2, 9);
    return;
  } else {
    HEAP32[r3 >> 2] = 2;
    HEAP32[r3 + 4 >> 2] = r2;
    HEAP32[r3 + 12 >> 2] = 0;
    _enet_peer_reset(r2);
    return;
  }
}
function _enet_protocol_send_acknowledgements(r1, r2) {
  var r3, r4, r5, r6, r7, r8, r9, r10, r11, r12, r13, r14, r15, r16, r17, r18, r19, r20, r21, r22, r23;
  r3 = r1 + 1608 | 0;
  r4 = r1 + 70 | 0;
  r5 = r1 + (HEAP32[r3 >> 2] * 48 & -1) + 70 | 0;
  r6 = r1 + 2132 | 0;
  r7 = r1 + 1612 | 0;
  r8 = (HEAP32[r6 >> 2] << 3) + r1 + 1612 | 0;
  r9 = r2 + 192 | 0;
  r10 = HEAP32[r9 >> 2];
  L1532 : do {
    if ((r10 | 0) == (r9 | 0)) {
      r11 = r8;
      r12 = r5;
    } else {
      r13 = r1 + 1606 | 0;
      r14 = r1 + 2132 | 0;
      r15 = r2 + 176 | 0;
      r16 = (r1 + 64 | 0) >> 2;
      r17 = r8;
      r18 = r5;
      r19 = r10;
      while (1) {
        if (!(r18 >>> 0 < r13 >>> 0 & r17 >>> 0 < r14 >>> 0)) {
          break;
        }
        if ((HEAP32[r15 >> 2] - HEAP32[r16] | 0) >>> 0 < 8) {
          break;
        }
        r20 = HEAP32[r19 >> 2];
        r21 = r18 | 0;
        HEAP32[r17 >> 2] = r21;
        HEAP32[r17 + 4 >> 2] = 8;
        HEAP32[r16] = HEAP32[r16] + 8 | 0;
        HEAP8[r21] = 1;
        r21 = r19 + 12 | 0;
        r22 = r21;
        HEAP8[r18 + 1 | 0] = HEAP8[r22 + 1 | 0];
        r23 = r22 + 2 | 0;
        r22 = r18 + 4 | 0;
        tempBigInt = _htons((tempInt = HEAPU8[r23] | HEAPU8[r23 + 1 | 0] << 8, tempInt << 16 >> 16));
        HEAP8[r22] = tempBigInt & 255;
        tempBigInt = tempBigInt >> 8;
        HEAP8[r22 + 1 | 0] = tempBigInt & 255;
        r22 = r18 + 6 | 0;
        tempBigInt = _htons(HEAP32[r19 + 8 >> 2] & 65535);
        HEAP8[r22] = tempBigInt & 255;
        tempBigInt = tempBigInt >> 8;
        HEAP8[r22 + 1 | 0] = tempBigInt & 255;
        if ((HEAP8[r21] & 15) << 24 >> 24 == 4) {
          _enet_protocol_dispatch_state(r1, r2, 9);
        }
        _enet_list_remove(r19);
        _enet_free(r19);
        r21 = r18 + 48 | 0;
        r22 = r17 + 8 | 0;
        if ((r20 | 0) == (r9 | 0)) {
          r11 = r22;
          r12 = r21;
          break L1532;
        } else {
          r17 = r22;
          r18 = r21;
          r19 = r20;
        }
      }
      HEAP32[r1 + 60 >> 2] = 1;
      r11 = r17;
      r12 = r18;
    }
  } while (0);
  HEAP32[r3 >> 2] = (r12 - r4 | 0) / 48 & -1;
  HEAP32[r6 >> 2] = r11 - r7 >> 3;
  return;
}
function _enet_protocol_check_timeouts(r1, r2, r3) {
  var r4, r5, r6, r7, r8, r9, r10, r11, r12, r13, r14, r15, r16, r17, r18, r19, r20, r21, r22, r23, r24, r25, r26, r27;
  r4 = 0;
  r5 = r2 + 200 | 0;
  r6 = r5 | 0;
  r7 = HEAP32[r6 >> 2];
  r8 = HEAP32[r2 + 216 >> 2];
  if ((r7 | 0) == (r5 | 0)) {
    r9 = 0;
    return r9;
  }
  r10 = r1 + 48 | 0;
  r11 = (r2 + 84 | 0) >> 2;
  r12 = r2 + 96 | 0;
  r13 = r2 + 80 | 0;
  r14 = r2 + 184 | 0;
  r15 = r2 + 148 | 0;
  r16 = r2 + 144 | 0;
  r17 = r7;
  L1547 : while (1) {
    r7 = HEAP32[r17 >> 2];
    r18 = HEAP32[r10 >> 2];
    r19 = r17 + 12 | 0;
    r20 = HEAP32[r19 >> 2];
    r21 = r18 - r20 | 0;
    r22 = r17 + 16 | 0;
    r23 = r22 >> 2;
    do {
      if ((r21 >>> 0 > 86399999 ? r20 - r18 | 0 : r21) >>> 0 >= HEAP32[r23] >>> 0) {
        r24 = HEAP32[r11];
        do {
          if ((r24 | 0) == 0) {
            r4 = 1183;
          } else {
            if ((r20 - r24 | 0) >>> 0 > 86399999) {
              r4 = 1183;
              break;
            }
            r25 = HEAP32[r11];
            break;
          }
        } while (0);
        if (r4 == 1183) {
          r4 = 0;
          r24 = HEAP32[r19 >> 2];
          HEAP32[r11] = r24;
          r25 = r24;
        }
        do {
          if ((r25 | 0) != 0) {
            r24 = HEAP32[r10 >> 2];
            r26 = r24 - r25 | 0;
            r27 = r26 >>> 0 > 86399999 ? r25 - r24 | 0 : r26;
            if (r27 >>> 0 >= HEAP32[r15 >> 2] >>> 0) {
              break L1547;
            }
            if (HEAP32[r23] >>> 0 < HEAP32[r17 + 20 >> 2] >>> 0) {
              break;
            }
            if (r27 >>> 0 >= HEAP32[r16 >> 2] >>> 0) {
              break L1547;
            }
          }
        } while (0);
        if ((HEAP32[r17 + 80 >> 2] | 0) != 0) {
          HEAP32[r14 >> 2] = HEAP32[r14 >> 2] - HEAPU16[r17 + 28 >> 1] | 0;
        }
        HEAP32[r12 >> 2] = HEAP32[r12 >> 2] + 1 | 0;
        HEAP32[r22 >> 2] = HEAP32[r23] << 1;
        _enet_list_insert(r8, _enet_list_remove(r17));
        r27 = HEAP32[r6 >> 2];
        if ((r7 | 0) != (r27 | 0) | (r27 | 0) == (r5 | 0)) {
          break;
        }
        HEAP32[r13 >> 2] = HEAP32[r7 + 16 >> 2] + HEAP32[r7 + 12 >> 2] | 0;
      }
    } while (0);
    if ((r7 | 0) == (r5 | 0)) {
      r9 = 0;
      r4 = 1195;
      break;
    } else {
      r17 = r7;
    }
  }
  if (r4 == 1195) {
    return r9;
  }
  _enet_protocol_notify_disconnect(r1, r2, r3);
  r9 = 1;
  return r9;
}
function _enet_protocol_send_reliable_outgoing_commands(r1, r2) {
  var r3, r4, r5, r6, r7, r8, r9, r10, r11, r12, r13, r14, r15, r16, r17, r18, r19, r20, r21, r22, r23, r24, r25, r26, r27, r28, r29, r30, r31, r32, r33, r34, r35, r36, r37, r38, r39, r40, r41, r42, r43, r44, r45, r46, r47, r48, r49, r50, r51, r52, r53, r54, r55, r56, r57, r58, r59, r60, r61, r62, r63, r64, r65, r66, r67, r68, r69, r70, r71;
  r3 = 0;
  r4 = (r1 + 1608 | 0) >> 2;
  r5 = r1 + 70 | 0;
  r6 = r1 + (HEAP32[r4] * 48 & -1) + 70 | 0;
  r7 = (r1 + 2132 | 0) >> 2;
  r8 = r1 + 1612 | 0;
  r9 = (HEAP32[r7] << 3) + r1 + 1612 | 0;
  r10 = r2 + 216 | 0;
  r11 = HEAP32[r10 >> 2];
  if ((r11 | 0) == (r10 | 0)) {
    r12 = 1;
    r13 = r9;
    r14 = r6;
    r15 = r14;
    r16 = r5;
    r17 = r15 - r16 | 0;
    r18 = (r17 | 0) / 48 & -1;
    HEAP32[r4] = r18;
    r19 = r13;
    r20 = r8;
    r21 = r19 - r20 | 0, r22 = r21 >> 3;
    r23 = r22;
    HEAP32[r7] = r23;
    return r12;
  }
  r24 = r2 + 44 | 0;
  r25 = r2 + 40 | 0;
  r26 = r2 + 108 | 0;
  r27 = r2 + 180 | 0;
  r28 = r2 + 184 | 0;
  r29 = r2 + 176 | 0;
  r30 = r1 + 1606 | 0;
  r31 = r1 + 2132 | 0;
  r32 = r2 + 176 | 0;
  r33 = (r1 + 64 | 0) >> 2;
  r34 = r2 + 168 | 0;
  r35 = r2 + 172 | 0;
  r36 = r2 + 140 | 0;
  r37 = r2 + 200 | 0;
  r38 = r37 | 0;
  r39 = r1 + 48 | 0;
  r40 = r2 + 80 | 0;
  r41 = r1 + 48 | 0;
  r42 = r1 + 68 | 0;
  r43 = r2 + 92 | 0;
  r44 = r2 + 184 | 0;
  r2 = r11;
  r11 = r9, r9 = r11 >> 2;
  r45 = 0;
  r46 = 0;
  r47 = 1;
  r48 = r6;
  L1575 : while (1) {
    r6 = HEAP32[r24 >> 2];
    r49 = r2;
    r50 = r45;
    r51 = r46;
    while (1) {
      r52 = r49;
      r53 = r51;
      L1579 : while (1) {
        r54 = r52;
        r55 = r52 + 32 | 0;
        r56 = HEAPU8[r55 + 1 | 0];
        if (r56 >>> 0 >= r6 >>> 0) {
          r3 = 1203;
          break;
        }
        r57 = HEAP32[r25 >> 2];
        r58 = r57 + (r56 * 60 & -1) | 0;
        r59 = HEAP16[r52 + 8 >> 1];
        r60 = (r59 & 65535) >>> 12;
        r61 = (r58 | 0) != 0;
        if (!r61) {
          r62 = r53;
          r63 = 0;
          r64 = r60;
          r65 = 0;
          break;
        }
        do {
          if ((r53 | 0) == 0) {
            if (HEAP16[r54 + 30 >> 1] << 16 >> 16 != 0) {
              r62 = 0;
              r63 = r58;
              r64 = r60;
              r65 = r61;
              break L1579;
            }
            if ((r59 & 4095) << 16 >> 16 != 0) {
              r62 = 0;
              r63 = r58;
              r64 = r60;
              r65 = r61;
              break L1579;
            }
            r66 = r60 & 65535;
            if (HEAPU16[r57 + (r56 * 60 & -1) + (((r66 | 16) - 1 | 0) % 16 << 1) + 6 >> 1] > 4095) {
              r67 = 1;
              break;
            }
            if ((HEAPU16[r57 + (r56 * 60 & -1) + 4 >> 1] & (255 >>> ((4096 - r66 | 0) >>> 0) | 255 << r66) | 0) != 0) {
              r67 = 1;
              break;
            }
            if ((r53 | 0) == 0) {
              r62 = 0;
              r63 = r58;
              r64 = r60;
              r65 = r61;
              break L1579;
            } else {
              r67 = r53;
            }
          } else {
            r67 = r53;
          }
        } while (0);
        r61 = HEAP32[r52 >> 2];
        if ((r61 | 0) == (r10 | 0)) {
          r12 = r47;
          r13 = r11;
          r14 = r48;
          r3 = 1235;
          break L1575;
        } else {
          r52 = r61;
          r53 = r67;
        }
      }
      if (r3 == 1203) {
        r3 = 0;
        r62 = r53;
        r63 = 0;
        r64 = HEAPU16[r52 + 8 >> 1] >>> 12;
        r65 = 0;
      }
      r68 = (r52 + 80 | 0) >> 2;
      if ((HEAP32[r68] | 0) == 0) {
        r69 = r50;
        break;
      }
      if ((r50 | 0) == 0) {
        r61 = Math.imul(HEAP32[r27 >> 2], HEAP32[r26 >> 2]) >>> 5;
        r60 = HEAP32[r29 >> 2];
        r58 = (HEAPU16[r52 + 28 >> 1] + HEAP32[r28 >> 2] | 0) >>> 0 > (r61 >>> 0 > r60 >>> 0 ? r61 : r60) >>> 0 ? 1 : r50;
        if ((r58 | 0) == 0) {
          r69 = 0;
          break;
        } else {
          r70 = r58;
        }
      } else {
        r70 = r50;
      }
      r58 = HEAP32[r52 >> 2];
      if ((r58 | 0) == (r10 | 0)) {
        r12 = r47;
        r13 = r11;
        r14 = r48;
        r3 = 1234;
        break L1575;
      } else {
        r49 = r58;
        r50 = r70;
        r51 = r62;
      }
    }
    r51 = r55;
    r50 = HEAP32[((HEAP8[r51] & 15) << 2) + 411016 >> 2];
    if (r48 >>> 0 >= r30 >>> 0) {
      r3 = 1221;
      break;
    }
    r49 = r11 + 8 | 0;
    if (r49 >>> 0 >= r31 >>> 0) {
      r3 = 1221;
      break;
    }
    r6 = HEAP32[r32 >> 2] - HEAP32[r33] | 0;
    if (r6 >>> 0 < r50 >>> 0) {
      r3 = 1221;
      break;
    }
    if ((HEAP32[r68] | 0) != 0) {
      if ((r6 & 65535) >>> 0 < (HEAPU16[r52 + 28 >> 1] + r50 & 65535) >>> 0) {
        r3 = 1221;
        break;
      }
    }
    r6 = HEAP32[r52 >> 2];
    do {
      if (r65) {
        if (HEAP16[r54 + 30 >> 1] << 16 >> 16 != 0) {
          break;
        }
        r58 = r64 & 65535;
        r60 = r63 + 4 | 0;
        HEAP16[r60 >> 1] = (HEAPU16[r60 >> 1] | 1 << r58) & 65535;
        r60 = (r58 << 1) + r63 + 6 | 0;
        HEAP16[r60 >> 1] = HEAP16[r60 >> 1] + 1 & 65535;
      }
    } while (0);
    r60 = r54 + 30 | 0;
    HEAP16[r60 >> 1] = HEAP16[r60 >> 1] + 1 & 65535;
    r60 = r52 + 16 | 0;
    r58 = r60;
    if ((HEAP32[r58 >> 2] | 0) == 0) {
      r61 = (HEAP32[r35 >> 2] << 2) + HEAP32[r34 >> 2] | 0;
      HEAP32[r60 >> 2] = r61;
      HEAP32[r52 + 20 >> 2] = Math.imul(r61, HEAP32[r36 >> 2]);
    }
    if ((HEAP32[r38 >> 2] | 0) == (r37 | 0)) {
      HEAP32[r40 >> 2] = HEAP32[r58 >> 2] + HEAP32[r39 >> 2] | 0;
    }
    _enet_list_insert(r37, _enet_list_remove(r52));
    HEAP32[r52 + 12 >> 2] = HEAP32[r41 >> 2];
    r58 = r48 | 0;
    HEAP32[r9] = r58;
    HEAP32[r9 + 1] = r50;
    HEAP32[r33] = HEAP32[r33] + r50 | 0;
    HEAP16[r42 >> 1] = HEAP16[r42 >> 1] | -32768;
    _memcpy(r58, r51, 48);
    r58 = HEAP32[r68];
    if ((r58 | 0) == 0) {
      r71 = r11;
    } else {
      HEAP32[r49 >> 2] = HEAP32[r58 + 8 >> 2] + HEAP32[r52 + 24 >> 2] | 0;
      r58 = (r52 + 28 | 0) >> 1;
      HEAP32[r9 + 3] = HEAPU16[r58];
      HEAP32[r33] = HEAP32[r33] + HEAPU16[r58] | 0;
      HEAP32[r44 >> 2] = HEAP32[r44 >> 2] + HEAPU16[r58] | 0;
      r71 = r49;
    }
    HEAP32[r43 >> 2] = HEAP32[r43 >> 2] + 1 | 0;
    r58 = r48 + 48 | 0;
    r61 = r71 + 8 | 0;
    if ((r6 | 0) == (r10 | 0)) {
      r12 = 0;
      r13 = r61;
      r14 = r58;
      r3 = 1233;
      break;
    } else {
      r2 = r6;
      r11 = r61, r9 = r11 >> 2;
      r45 = r69;
      r46 = r62;
      r47 = 0;
      r48 = r58;
    }
  }
  if (r3 == 1233) {
    r15 = r14;
    r16 = r5;
    r17 = r15 - r16 | 0;
    r18 = (r17 | 0) / 48 & -1;
    HEAP32[r4] = r18;
    r19 = r13;
    r20 = r8;
    r21 = r19 - r20 | 0, r22 = r21 >> 3;
    r23 = r22;
    HEAP32[r7] = r23;
    return r12;
  } else if (r3 == 1221) {
    HEAP32[r1 + 60 >> 2] = 1;
    r12 = 0;
    r13 = r11;
    r14 = r48;
    r15 = r14;
    r16 = r5;
    r17 = r15 - r16 | 0;
    r18 = (r17 | 0) / 48 & -1;
    HEAP32[r4] = r18;
    r19 = r13;
    r20 = r8;
    r21 = r19 - r20 | 0, r22 = r21 >> 3;
    r23 = r22;
    HEAP32[r7] = r23;
    return r12;
  } else if (r3 == 1234) {
    r15 = r14;
    r16 = r5;
    r17 = r15 - r16 | 0;
    r18 = (r17 | 0) / 48 & -1;
    HEAP32[r4] = r18;
    r19 = r13;
    r20 = r8;
    r21 = r19 - r20 | 0, r22 = r21 >> 3;
    r23 = r22;
    HEAP32[r7] = r23;
    return r12;
  } else if (r3 == 1235) {
    r15 = r14;
    r16 = r5;
    r17 = r15 - r16 | 0;
    r18 = (r17 | 0) / 48 & -1;
    HEAP32[r4] = r18;
    r19 = r13;
    r20 = r8;
    r21 = r19 - r20 | 0, r22 = r21 >> 3;
    r23 = r22;
    HEAP32[r7] = r23;
    return r12;
  }
}
function _enet_initialize() {
  return 0;
}
function _enet_deinitialize() {
  return;
}
function _enet_protocol_send_unreliable_outgoing_commands(r1, r2) {
  var r3, r4, r5, r6, r7, r8, r9, r10, r11, r12, r13, r14, r15, r16, r17, r18, r19, r20, r21, r22, r23, r24, r25, r26, r27, r28, r29, r30, r31, r32, r33, r34, r35, r36, r37, r38, r39;
  r3 = 0;
  r4 = r1 + 1608 | 0;
  r5 = r1 + 70 | 0;
  r6 = r1 + (HEAP32[r4 >> 2] * 48 & -1) + 70 | 0;
  r7 = r1 + 2132 | 0;
  r8 = r1 + 1612 | 0;
  r9 = (HEAP32[r7 >> 2] << 3) + r1 + 1612 | 0;
  r10 = r2 + 224 | 0;
  r11 = r10 | 0;
  r12 = HEAP32[r11 >> 2];
  L1626 : do {
    if ((r12 | 0) == (r10 | 0)) {
      r13 = r9;
      r14 = r6;
    } else {
      r15 = r1 + 1606 | 0;
      r16 = r1 + 2132 | 0;
      r17 = r2 + 176 | 0;
      r18 = (r1 + 64 | 0) >> 2;
      r19 = r2 + 116 | 0;
      r20 = r2 + 108 | 0;
      r21 = r2 + 208 | 0;
      r22 = r12;
      r23 = r9, r24 = r23 >> 2;
      r25 = r6;
      L1628 : while (1) {
        r26 = r23 + 8 | 0;
        r27 = r26 >>> 0 < r16 >>> 0;
        if (r25 >>> 0 < r15 >>> 0) {
          r28 = r22;
        } else {
          break;
        }
        while (1) {
          r29 = r28;
          r30 = r28 + 32 | 0;
          r31 = HEAP32[((HEAP8[r30] & 15) << 2) + 411016 >> 2];
          if (!r27) {
            break L1628;
          }
          r32 = HEAP32[r17 >> 2] - HEAP32[r18] | 0;
          if (r32 >>> 0 < r31 >>> 0) {
            break L1628;
          }
          r33 = (r28 + 80 | 0) >> 2;
          if ((HEAP32[r33] | 0) == 0) {
            r3 = 1247;
            break;
          }
          if (r32 >>> 0 < (HEAPU16[r28 + 28 >> 1] + r31 | 0) >>> 0) {
            break L1628;
          }
          r32 = HEAP32[r28 >> 2];
          if ((HEAP32[r33] | 0) == 0) {
            r34 = r32;
            break;
          }
          if ((HEAP32[r28 + 24 >> 2] | 0) != 0) {
            r34 = r32;
            break;
          }
          r35 = HEAP32[r19 >> 2] + 7 & 31;
          HEAP32[r19 >> 2] = r35;
          if (r35 >>> 0 <= HEAP32[r20 >> 2] >>> 0) {
            r34 = r32;
            break;
          }
          r35 = HEAP16[r28 + 8 >> 1];
          r36 = HEAP16[r29 + 10 >> 1];
          r37 = r29;
          r29 = r32;
          while (1) {
            r32 = r37 + 80 | 0;
            r38 = HEAP32[r32 >> 2] | 0;
            HEAP32[r38 >> 2] = HEAP32[r38 >> 2] - 1 | 0;
            r38 = HEAP32[r32 >> 2];
            if ((HEAP32[r38 >> 2] | 0) == 0) {
              _enet_packet_destroy(r38);
            }
            _enet_list_remove(r37 | 0);
            _enet_free(r37);
            if ((r29 | 0) == (r10 | 0)) {
              break;
            }
            r38 = r29;
            if (HEAP16[r29 + 8 >> 1] << 16 >> 16 != r35 << 16 >> 16) {
              break;
            }
            if (HEAP16[r38 + 10 >> 1] << 16 >> 16 != r36 << 16 >> 16) {
              break;
            }
            r37 = r38;
            r29 = HEAP32[r29 >> 2];
          }
          if ((r29 | 0) == (r10 | 0)) {
            r13 = r23;
            r14 = r25;
            break L1626;
          } else {
            r28 = r29;
          }
        }
        if (r3 == 1247) {
          r3 = 0;
          r34 = HEAP32[r28 >> 2];
        }
        r27 = r25 | 0;
        HEAP32[r24] = r27;
        HEAP32[r24 + 1] = r31;
        HEAP32[r18] = HEAP32[r18] + r31 | 0;
        _memcpy(r27, r30, 48);
        _enet_list_remove(r28);
        r27 = HEAP32[r33];
        if ((r27 | 0) == 0) {
          _enet_free(r28);
          r39 = r23;
        } else {
          HEAP32[r26 >> 2] = HEAP32[r27 + 8 >> 2] + HEAP32[r28 + 24 >> 2] | 0;
          r27 = HEAPU16[r28 + 28 >> 1];
          HEAP32[r24 + 3] = r27;
          HEAP32[r18] = HEAP32[r18] + r27 | 0;
          _enet_list_insert(r21, r28);
          r39 = r26;
        }
        r27 = r25 + 48 | 0;
        r37 = r39 + 8 | 0;
        if ((r34 | 0) == (r10 | 0)) {
          r13 = r37;
          r14 = r27;
          break L1626;
        } else {
          r22 = r34;
          r23 = r37, r24 = r23 >> 2;
          r25 = r27;
        }
      }
      HEAP32[r1 + 60 >> 2] = 1;
      r13 = r23;
      r14 = r25;
    }
  } while (0);
  HEAP32[r4 >> 2] = (r14 - r5 | 0) / 48 & -1;
  HEAP32[r7 >> 2] = r13 - r8 >> 3;
  if ((HEAP32[r2 + 36 >> 2] | 0) != 6) {
    return;
  }
  r8 = r2 + 216 | 0;
  if ((HEAP32[r8 >> 2] | 0) != (r8 | 0)) {
    return;
  }
  if ((HEAP32[r11 >> 2] | 0) != (r10 | 0)) {
    return;
  }
  r10 = r2 + 200 | 0;
  if ((HEAP32[r10 >> 2] | 0) != (r10 | 0)) {
    return;
  }
  _enet_peer_disconnect(r2, HEAP32[r2 + 376 >> 2]);
  return;
}
function _enet_protocol_remove_sent_unreliable_commands(r1) {
  var r2, r3, r4, r5, r6;
  r2 = r1 + 208 | 0;
  r1 = r2 | 0;
  r3 = HEAP32[r1 >> 2];
  if ((r3 | 0) == (r2 | 0)) {
    return;
  } else {
    r4 = r3;
  }
  while (1) {
    _enet_list_remove(r4);
    r3 = r4 + 80 | 0;
    r5 = HEAP32[r3 >> 2];
    do {
      if ((r5 | 0) != 0) {
        r6 = r5 | 0;
        HEAP32[r6 >> 2] = HEAP32[r6 >> 2] - 1 | 0;
        r6 = HEAP32[r3 >> 2];
        if ((HEAP32[r6 >> 2] | 0) != 0) {
          break;
        }
        _enet_packet_destroy(r6);
      }
    } while (0);
    _enet_free(r4);
    r3 = HEAP32[r1 >> 2];
    if ((r3 | 0) == (r2 | 0)) {
      break;
    } else {
      r4 = r3;
    }
  }
  return;
}
function _enet_time_get() {
  var r1, r2;
  r1 = STACKTOP;
  STACKTOP = STACKTOP + 8 | 0;
  r2 = r1;
  _gettimeofday(r2, 0);
  STACKTOP = r1;
  return ((HEAP32[r2 + 4 >> 2] | 0) / 1e3 & -1) + (HEAP32[r2 >> 2] * 1e3 & -1) - HEAP32[102400] | 0;
}
function _enet_time_set(r1) {
  var r2, r3;
  r2 = STACKTOP;
  STACKTOP = STACKTOP + 8 | 0;
  r3 = r2;
  _gettimeofday(r3, 0);
  HEAP32[102400] = (HEAP32[r3 >> 2] * 1e3 & -1) - r1 + ((HEAP32[r3 + 4 >> 2] | 0) / 1e3 & -1) | 0;
  STACKTOP = r2;
  return;
}
function _enet_address_set_host(r1, r2) {
  var r3, r4;
  r3 = _gethostbyname(r2);
  do {
    if ((r3 | 0) != 0) {
      if ((HEAP32[r3 + 8 >> 2] | 0) != 1) {
        break;
      }
      HEAP32[r1 >> 2] = HEAP32[HEAP32[HEAP32[r3 + 16 >> 2] >> 2] >> 2];
      r4 = 0;
      return r4;
    }
  } while (0);
  r4 = ((_inet_aton(r2, r1) | 0) == 0) << 31 >> 31;
  return r4;
}
function _enet_address_get_host_ip(r1, r2, r3) {
  var r4, r5;
  r4 = _inet_ntoa(HEAP32[r1 >> 2]);
  if ((r4 | 0) == 0) {
    r5 = -1;
    return r5;
  }
  _strncpy(r2, r4, r3);
  r5 = 0;
  return r5;
}
function _enet_address_get_host(r1, r2, r3) {
  var r4, r5, r6;
  r4 = STACKTOP;
  STACKTOP = STACKTOP + 4 | 0;
  r5 = r4;
  HEAP32[r5 >> 2] = HEAP32[r1 >> 2];
  r6 = _gethostbyaddr(r5, 4, 1);
  if ((r6 | 0) == 0) {
    r5 = _enet_address_get_host_ip(r1, r2, r3);
    STACKTOP = r4;
    return r5;
  } else {
    _strncpy(r2, HEAP32[r6 >> 2], r3);
    r5 = 0;
    STACKTOP = r4;
    return r5;
  }
}
function _enet_socket_bind(r1, r2) {
  var r3, r4, r5, r6;
  r3 = STACKTOP;
  STACKTOP = STACKTOP + 20 | 0;
  r4 = r3;
  r5 = r4 >> 2;
  HEAP32[r5] = 0;
  HEAP32[r5 + 1] = 0;
  HEAP32[r5 + 2] = 0;
  HEAP32[r5 + 3] = 0;
  HEAP32[r5 + 4] = 0;
  HEAP32[r4 >> 2] = 1;
  if ((r2 | 0) == 0) {
    HEAP16[r4 + 4 >> 1] = 0;
    HEAP32[r4 + 8 >> 2] = 0;
    r5 = r4;
    r6 = _bind(r1, r5, 20);
    STACKTOP = r3;
    return r6;
  } else {
    HEAP16[r4 + 4 >> 1] = _htons(HEAP16[r2 + 4 >> 1]);
    HEAP32[r4 + 8 >> 2] = HEAP32[r2 >> 2];
    r5 = r4;
    r6 = _bind(r1, r5, 20);
    STACKTOP = r3;
    return r6;
  }
}
function _enet_socket_listen(r1, r2) {
  return _listen(r1, (r2 | 0) < 0 ? 128 : r2);
}
function _enet_socket_create(r1) {
  return _socket(2, (r1 | 0) == 2 ? 20 : 200, 0);
}
function _enet_socket_set_option(r1, r2, r3) {
  var r4, r5, r6;
  r4 = STACKTOP;
  STACKTOP = STACKTOP + 4 | 0;
  r5 = r4;
  HEAP32[r5 >> 2] = r3;
  if ((r2 | 0) == 4) {
    r6 = _setsockopt(r1, 50, 40, r5, 4);
  } else if ((r2 | 0) == 5) {
    r6 = _setsockopt(r1, 50, 30, r5, 4);
  } else if ((r2 | 0) == 7) {
    r6 = _setsockopt(r1, 50, 2e3, r5, 4);
  } else if ((r2 | 0) == 2) {
    r6 = _setsockopt(r1, 50, 6, r5, 4);
  } else if ((r2 | 0) == 3) {
    r6 = _setsockopt(r1, 50, 60, r5, 4);
  } else if ((r2 | 0) == 6) {
    r6 = _setsockopt(r1, 50, 1e3, r5, 4);
  } else {
    r6 = -1;
  }
  STACKTOP = r4;
  return ((r6 | 0) == -1) << 31 >> 31;
}
function _enet_socket_connect(r1, r2) {
  var r3, r4, r5, r6;
  r3 = STACKTOP;
  STACKTOP = STACKTOP + 20 | 0;
  r4 = r3;
  r5 = r4 >> 2;
  HEAP32[r5] = 0;
  HEAP32[r5 + 1] = 0;
  HEAP32[r5 + 2] = 0;
  HEAP32[r5 + 3] = 0;
  HEAP32[r5 + 4] = 0;
  HEAP32[r4 >> 2] = 1;
  HEAP16[r4 + 4 >> 1] = _htons(HEAP16[r2 + 4 >> 1]);
  HEAP32[r4 + 8 >> 2] = HEAP32[r2 >> 2];
  r2 = _connect(r1, r4, 20);
  do {
    if ((r2 | 0) == -1) {
      if ((HEAP32[___errno_location() >> 2] | 0) == 119) {
        r6 = 0;
      } else {
        break;
      }
      STACKTOP = r3;
      return r6;
    }
  } while (0);
  r6 = r2;
  STACKTOP = r3;
  return r6;
}
function _enet_socket_accept(r1, r2) {
  var r3, r4, r5, r6, r7, r8;
  r3 = STACKTOP;
  STACKTOP = STACKTOP + 24 | 0;
  r4 = r3;
  r5 = r3 + 20;
  HEAP32[r5 >> 2] = 20;
  r6 = (r2 | 0) != 0;
  if (r6) {
    r7 = r4;
  } else {
    r7 = 0;
  }
  r8 = _accept(r1, r7, r6 ? r5 : 0);
  if ((r8 | 0) == -1 | r6 ^ 1) {
    STACKTOP = r3;
    return r8;
  }
  HEAP32[r2 >> 2] = HEAP32[r4 + 8 >> 2];
  HEAP16[r2 + 4 >> 1] = _htons(HEAP16[r4 + 4 >> 1]);
  STACKTOP = r3;
  return r8;
}
function _enet_socket_shutdown(r1, r2) {
  return _shutdown(r1, r2);
}
function _enet_socket_destroy(r1) {
  if ((r1 | 0) == -1) {
    return;
  }
  _close(r1);
  return;
}
function _enet_socket_send(r1, r2, r3, r4) {
  var r5, r6, r7, r8, r9, r10, r11;
  r5 = STACKTOP;
  STACKTOP = STACKTOP + 48 | 0;
  r6 = r5, r7 = r6 >> 2;
  r8 = r5 + 28;
  r9 = r6 >> 2;
  HEAP32[r9] = 0;
  HEAP32[r9 + 1] = 0;
  HEAP32[r9 + 2] = 0;
  HEAP32[r9 + 3] = 0;
  HEAP32[r9 + 4] = 0;
  HEAP32[r9 + 5] = 0;
  HEAP32[r9 + 6] = 0;
  if ((r2 | 0) != 0) {
    r9 = r8, r10 = r9 >> 2;
    HEAP32[r10] = 0;
    HEAP32[r10 + 1] = 0;
    HEAP32[r10 + 2] = 0;
    HEAP32[r10 + 3] = 0;
    HEAP32[r10 + 4] = 0;
    HEAP32[r8 >> 2] = 1;
    HEAP16[r8 + 4 >> 1] = _htons(HEAP16[r2 + 4 >> 1]);
    HEAP32[r8 + 8 >> 2] = HEAP32[r2 >> 2];
    HEAP32[r7] = r9;
    HEAP32[r7 + 1] = 20;
  }
  HEAP32[r7 + 2] = r3;
  HEAP32[r7 + 3] = r4;
  r4 = _sendmsg(r1, r6, 0);
  if ((r4 | 0) != -1) {
    r11 = r4;
    STACKTOP = r5;
    return r11;
  }
  r11 = ((HEAP32[___errno_location() >> 2] | 0) != 11) << 31 >> 31;
  STACKTOP = r5;
  return r11;
}
function _enet_socket_receive(r1, r2, r3, r4) {
  var r5, r6, r7, r8, r9, r10;
  r5 = STACKTOP;
  STACKTOP = STACKTOP + 48 | 0;
  r6 = r5, r7 = r6 >> 2;
  r8 = r5 + 28;
  r9 = r6 >> 2;
  HEAP32[r9] = 0;
  HEAP32[r9 + 1] = 0;
  HEAP32[r9 + 2] = 0;
  HEAP32[r9 + 3] = 0;
  HEAP32[r9 + 4] = 0;
  HEAP32[r9 + 5] = 0;
  HEAP32[r9 + 6] = 0;
  r9 = (r2 | 0) != 0;
  if (r9) {
    HEAP32[r7] = r8;
    HEAP32[r7 + 1] = 20;
  }
  HEAP32[r7 + 2] = r3;
  HEAP32[r7 + 3] = r4;
  r4 = _recvmsg(r1, r6, 0);
  if ((r4 | 0) == -1) {
    r10 = ((HEAP32[___errno_location() >> 2] | 0) != 11) << 31 >> 31;
    STACKTOP = r5;
    return r10;
  }
  if (!r9) {
    r10 = r4;
    STACKTOP = r5;
    return r10;
  }
  HEAP32[r2 >> 2] = HEAP32[r8 + 8 >> 2];
  HEAP16[r2 + 4 >> 1] = _htons(HEAP16[r8 + 4 >> 1]);
  r10 = r4;
  STACKTOP = r5;
  return r10;
}
function _enet_socketset_select(r1, r2, r3, r4) {
  var r5, r6;
  r5 = STACKTOP;
  STACKTOP = STACKTOP + 8 | 0;
  r6 = r5;
  HEAP32[r6 >> 2] = Math.floor((r4 >>> 0) / 1e3);
  HEAP32[r6 + 4 >> 2] = (r4 >>> 0) % 1e3 * 1e3 & -1;
  r4 = _select(r1 + 1 | 0, r2, r3, 0, r6);
  STACKTOP = r5;
  return r4;
}
function _enet_socket_wait(r1, r2, r3) {
  var r4, r5, r6, r7, r8;
  r4 = r2 >> 2;
  r2 = STACKTOP;
  STACKTOP = STACKTOP + 24 | 0;
  r5 = r2;
  r6 = r2 + 8;
  r7 = r2 + 16;
  HEAP32[r7 >> 2] = Math.floor((r3 >>> 0) / 1e3);
  HEAP32[r7 + 4 >> 2] = (r3 >>> 0) % 1e3 * 1e3 & -1;
  r3 = r5;
  HEAP32[r3 >> 2] = 0;
  HEAP32[r3 + 4 >> 2] = 0;
  r3 = r6;
  HEAP32[r3 >> 2] = 0;
  HEAP32[r3 + 4 >> 2] = 0;
  if ((HEAP32[r4] & 1 | 0) != 0) {
    r3 = (r1 >>> 5 << 2) + r6 | 0;
    HEAP32[r3 >> 2] = HEAP32[r3 >> 2] | 1 << (r1 & 31);
  }
  if ((HEAP32[r4] & 2 | 0) != 0) {
    r3 = (r1 >>> 5 << 2) + r5 | 0;
    HEAP32[r3 >> 2] = HEAP32[r3 >> 2] | 1 << (r1 & 31);
  }
  r3 = _select(r1 + 1 | 0, r5, r6, 0, r7);
  if ((r3 | 0) < 0) {
    r8 = -1;
    STACKTOP = r2;
    return r8;
  }
  HEAP32[r4] = 0;
  if ((r3 | 0) == 0) {
    r8 = 0;
    STACKTOP = r2;
    return r8;
  }
  r3 = r1 >>> 5;
  r7 = 1 << (r1 & 31);
  if ((HEAP32[r6 + (r3 << 2) >> 2] & r7 | 0) != 0) {
    HEAP32[r4] = 1;
  }
  if ((HEAP32[r5 + (r3 << 2) >> 2] & r7 | 0) == 0) {
    r8 = 0;
    STACKTOP = r2;
    return r8;
  }
  HEAP32[r4] = HEAP32[r4] | 2;
  r8 = 0;
  STACKTOP = r2;
  return r8;
}
function _malloc(r1) {
  var r2, r3, r4, r5, r6, r7, r8, r9, r10, r11, r12, r13, r14, r15, r16, r17, r18;
  do {
    if (r1 >>> 0 < 245) {
      if (r1 >>> 0 < 11) {
        r2 = 16;
      } else {
        r2 = r1 + 11 & -8;
      }
      r3 = r2 >>> 3;
      r4 = HEAP32[102854];
      r5 = r4 >>> (r3 >>> 0);
      if ((r5 & 3 | 0) != 0) {
        r6 = (r5 & 1 ^ 1) + r3 | 0;
        r7 = r6 << 1;
        r8 = (r7 << 2) + 411456 | 0;
        r9 = (r7 + 2 << 2) + 411456 | 0;
        r7 = HEAP32[r9 >> 2];
        r10 = r7 + 8 | 0;
        r11 = HEAP32[r10 >> 2];
        do {
          if ((r8 | 0) == (r11 | 0)) {
            HEAP32[102854] = r4 & (1 << r6 ^ -1);
          } else {
            if (r11 >>> 0 < HEAP32[102858] >>> 0) {
              _abort();
            }
            r12 = r11 + 12 | 0;
            if ((HEAP32[r12 >> 2] | 0) == (r7 | 0)) {
              HEAP32[r12 >> 2] = r8;
              HEAP32[r9 >> 2] = r11;
              break;
            } else {
              _abort();
            }
          }
        } while (0);
        r11 = r6 << 3;
        HEAP32[r7 + 4 >> 2] = r11 | 3;
        r9 = r7 + (r11 | 4) | 0;
        HEAP32[r9 >> 2] = HEAP32[r9 >> 2] | 1;
        r13 = r10;
        return r13;
      }
      if (r2 >>> 0 <= HEAP32[102856] >>> 0) {
        r14 = r2;
        break;
      }
      if ((r5 | 0) == 0) {
        if ((HEAP32[102855] | 0) == 0) {
          r14 = r2;
          break;
        }
        r9 = _tmalloc_small(r2);
        if ((r9 | 0) == 0) {
          r14 = r2;
          break;
        } else {
          r13 = r9;
        }
        return r13;
      }
      r9 = 2 << r3;
      r11 = r5 << r3 & (r9 | -r9);
      r9 = (r11 & -r11) - 1 | 0;
      r11 = r9 >>> 12 & 16;
      r8 = r9 >>> (r11 >>> 0);
      r9 = r8 >>> 5 & 8;
      r12 = r8 >>> (r9 >>> 0);
      r8 = r12 >>> 2 & 4;
      r15 = r12 >>> (r8 >>> 0);
      r12 = r15 >>> 1 & 2;
      r16 = r15 >>> (r12 >>> 0);
      r15 = r16 >>> 1 & 1;
      r17 = (r9 | r11 | r8 | r12 | r15) + (r16 >>> (r15 >>> 0)) | 0;
      r15 = r17 << 1;
      r16 = (r15 << 2) + 411456 | 0;
      r12 = (r15 + 2 << 2) + 411456 | 0;
      r15 = HEAP32[r12 >> 2];
      r8 = r15 + 8 | 0;
      r11 = HEAP32[r8 >> 2];
      do {
        if ((r16 | 0) == (r11 | 0)) {
          HEAP32[102854] = r4 & (1 << r17 ^ -1);
        } else {
          if (r11 >>> 0 < HEAP32[102858] >>> 0) {
            _abort();
          }
          r9 = r11 + 12 | 0;
          if ((HEAP32[r9 >> 2] | 0) == (r15 | 0)) {
            HEAP32[r9 >> 2] = r16;
            HEAP32[r12 >> 2] = r11;
            break;
          } else {
            _abort();
          }
        }
      } while (0);
      r11 = r17 << 3;
      r12 = r11 - r2 | 0;
      HEAP32[r15 + 4 >> 2] = r2 | 3;
      r16 = r15;
      r4 = r16 + r2 | 0;
      HEAP32[r16 + (r2 | 4) >> 2] = r12 | 1;
      HEAP32[r16 + r11 >> 2] = r12;
      r11 = HEAP32[102856];
      if ((r11 | 0) != 0) {
        r16 = HEAP32[102859];
        r3 = r11 >>> 3;
        r11 = r3 << 1;
        r5 = (r11 << 2) + 411456 | 0;
        r10 = HEAP32[102854];
        r7 = 1 << r3;
        do {
          if ((r10 & r7 | 0) == 0) {
            HEAP32[102854] = r10 | r7;
            r18 = r5;
          } else {
            r3 = HEAP32[(r11 + 2 << 2) + 411456 >> 2];
            if (r3 >>> 0 >= HEAP32[102858] >>> 0) {
              r18 = r3;
              break;
            }
            _abort();
          }
        } while (0);
        HEAP32[(r11 + 2 << 2) + 411456 >> 2] = r16;
        HEAP32[r18 + 12 >> 2] = r16;
        HEAP32[r16 + 8 >> 2] = r18;
        HEAP32[r16 + 12 >> 2] = r5;
      }
      HEAP32[102856] = r12;
      HEAP32[102859] = r4;
      r13 = r8;
      return r13;
    } else {
      if (r1 >>> 0 > 4294967231) {
        r14 = -1;
        break;
      }
      r7 = r1 + 11 & -8;
      if ((HEAP32[102855] | 0) == 0) {
        r14 = r7;
        break;
      }
      r10 = _tmalloc_large(r7);
      if ((r10 | 0) == 0) {
        r14 = r7;
        break;
      } else {
        r13 = r10;
      }
      return r13;
    }
  } while (0);
  r1 = HEAP32[102856];
  if (r14 >>> 0 > r1 >>> 0) {
    r18 = HEAP32[102857];
    if (r14 >>> 0 < r18 >>> 0) {
      r2 = r18 - r14 | 0;
      HEAP32[102857] = r2;
      r18 = HEAP32[102860];
      r10 = r18;
      HEAP32[102860] = r10 + r14 | 0;
      HEAP32[r14 + (r10 + 4) >> 2] = r2 | 1;
      HEAP32[r18 + 4 >> 2] = r14 | 3;
      r13 = r18 + 8 | 0;
      return r13;
    } else {
      r13 = _sys_alloc(r14);
      return r13;
    }
  } else {
    r18 = r1 - r14 | 0;
    r2 = HEAP32[102859];
    if (r18 >>> 0 > 15) {
      r10 = r2;
      HEAP32[102859] = r10 + r14 | 0;
      HEAP32[102856] = r18;
      HEAP32[r14 + (r10 + 4) >> 2] = r18 | 1;
      HEAP32[r10 + r1 >> 2] = r18;
      HEAP32[r2 + 4 >> 2] = r14 | 3;
    } else {
      HEAP32[102856] = 0;
      HEAP32[102859] = 0;
      HEAP32[r2 + 4 >> 2] = r1 | 3;
      r14 = r1 + (r2 + 4) | 0;
      HEAP32[r14 >> 2] = HEAP32[r14 >> 2] | 1;
    }
    r13 = r2 + 8 | 0;
    return r13;
  }
}
function _tmalloc_small(r1) {
  var r2, r3, r4, r5, r6, r7, r8, r9, r10, r11, r12, r13, r14, r15, r16, r17, r18, r19, r20, r21;
  r2 = HEAP32[102855];
  r3 = (r2 & -r2) - 1 | 0;
  r2 = r3 >>> 12 & 16;
  r4 = r3 >>> (r2 >>> 0);
  r3 = r4 >>> 5 & 8;
  r5 = r4 >>> (r3 >>> 0);
  r4 = r5 >>> 2 & 4;
  r6 = r5 >>> (r4 >>> 0);
  r5 = r6 >>> 1 & 2;
  r7 = r6 >>> (r5 >>> 0);
  r6 = r7 >>> 1 & 1;
  r8 = HEAP32[((r3 | r2 | r4 | r5 | r6) + (r7 >>> (r6 >>> 0)) << 2) + 411720 >> 2];
  r6 = r8;
  r7 = r8, r5 = r7 >> 2;
  r4 = (HEAP32[r8 + 4 >> 2] & -8) - r1 | 0;
  while (1) {
    r8 = HEAP32[r6 + 16 >> 2];
    if ((r8 | 0) == 0) {
      r2 = HEAP32[r6 + 20 >> 2];
      if ((r2 | 0) == 0) {
        break;
      } else {
        r9 = r2;
      }
    } else {
      r9 = r8;
    }
    r8 = (HEAP32[r9 + 4 >> 2] & -8) - r1 | 0;
    r2 = r8 >>> 0 < r4 >>> 0;
    r6 = r9;
    r7 = r2 ? r9 : r7, r5 = r7 >> 2;
    r4 = r2 ? r8 : r4;
  }
  r9 = r7;
  r6 = HEAP32[102858];
  if (r9 >>> 0 < r6 >>> 0) {
    _abort();
  }
  r8 = r9 + r1 | 0;
  r2 = r8;
  if (r9 >>> 0 >= r8 >>> 0) {
    _abort();
  }
  r8 = HEAP32[r5 + 6];
  r3 = HEAP32[r5 + 3];
  L1854 : do {
    if ((r3 | 0) == (r7 | 0)) {
      r10 = r7 + 20 | 0;
      r11 = HEAP32[r10 >> 2];
      do {
        if ((r11 | 0) == 0) {
          r12 = r7 + 16 | 0;
          r13 = HEAP32[r12 >> 2];
          if ((r13 | 0) == 0) {
            r14 = 0, r15 = r14 >> 2;
            break L1854;
          } else {
            r16 = r13;
            r17 = r12;
            break;
          }
        } else {
          r16 = r11;
          r17 = r10;
        }
      } while (0);
      while (1) {
        r10 = r16 + 20 | 0;
        if ((HEAP32[r10 >> 2] | 0) == 0) {
          r11 = r16 + 16 | 0;
          if ((HEAP32[r11 >> 2] | 0) == 0) {
            break;
          } else {
            r18 = r11;
          }
        } else {
          r18 = r10;
        }
        r16 = HEAP32[r18 >> 2];
        r17 = r18;
      }
      if (r17 >>> 0 < HEAP32[102858] >>> 0) {
        _abort();
      } else {
        HEAP32[r17 >> 2] = 0;
        r14 = r16, r15 = r14 >> 2;
        break;
      }
    } else {
      r10 = HEAP32[r5 + 2];
      if (r10 >>> 0 < r6 >>> 0) {
        _abort();
      }
      r11 = r10 + 12 | 0;
      if ((HEAP32[r11 >> 2] | 0) != (r7 | 0)) {
        _abort();
      }
      r12 = r3 + 8 | 0;
      if ((HEAP32[r12 >> 2] | 0) == (r7 | 0)) {
        HEAP32[r11 >> 2] = r3;
        HEAP32[r12 >> 2] = r10;
        r14 = r3, r15 = r14 >> 2;
        break;
      } else {
        _abort();
      }
    }
  } while (0);
  L1878 : do {
    if ((r8 | 0) != 0) {
      r3 = r7 + 28 | 0;
      r6 = (HEAP32[r3 >> 2] << 2) + 411720 | 0;
      do {
        if ((r7 | 0) == (HEAP32[r6 >> 2] | 0)) {
          HEAP32[r6 >> 2] = r14;
          if ((r14 | 0) != 0) {
            break;
          }
          HEAP32[102855] = HEAP32[102855] & (1 << HEAP32[r3 >> 2] ^ -1);
          break L1878;
        } else {
          if (r8 >>> 0 < HEAP32[102858] >>> 0) {
            _abort();
          }
          r16 = r8 + 16 | 0;
          if ((HEAP32[r16 >> 2] | 0) == (r7 | 0)) {
            HEAP32[r16 >> 2] = r14;
          } else {
            HEAP32[r8 + 20 >> 2] = r14;
          }
          if ((r14 | 0) == 0) {
            break L1878;
          }
        }
      } while (0);
      if (r14 >>> 0 < HEAP32[102858] >>> 0) {
        _abort();
      }
      HEAP32[r15 + 6] = r8;
      r3 = HEAP32[r5 + 4];
      do {
        if ((r3 | 0) != 0) {
          if (r3 >>> 0 < HEAP32[102858] >>> 0) {
            _abort();
          } else {
            HEAP32[r15 + 4] = r3;
            HEAP32[r3 + 24 >> 2] = r14;
            break;
          }
        }
      } while (0);
      r3 = HEAP32[r5 + 5];
      if ((r3 | 0) == 0) {
        break;
      }
      if (r3 >>> 0 < HEAP32[102858] >>> 0) {
        _abort();
      } else {
        HEAP32[r15 + 5] = r3;
        HEAP32[r3 + 24 >> 2] = r14;
        break;
      }
    }
  } while (0);
  if (r4 >>> 0 < 16) {
    r14 = r4 + r1 | 0;
    HEAP32[r5 + 1] = r14 | 3;
    r15 = r14 + (r9 + 4) | 0;
    HEAP32[r15 >> 2] = HEAP32[r15 >> 2] | 1;
    r19 = r7 + 8 | 0;
    r20 = r19;
    return r20;
  }
  HEAP32[r5 + 1] = r1 | 3;
  HEAP32[r1 + (r9 + 4) >> 2] = r4 | 1;
  HEAP32[r9 + r4 + r1 >> 2] = r4;
  r1 = HEAP32[102856];
  if ((r1 | 0) != 0) {
    r9 = HEAP32[102859];
    r5 = r1 >>> 3;
    r1 = r5 << 1;
    r15 = (r1 << 2) + 411456 | 0;
    r14 = HEAP32[102854];
    r8 = 1 << r5;
    do {
      if ((r14 & r8 | 0) == 0) {
        HEAP32[102854] = r14 | r8;
        r21 = r15;
      } else {
        r5 = HEAP32[(r1 + 2 << 2) + 411456 >> 2];
        if (r5 >>> 0 >= HEAP32[102858] >>> 0) {
          r21 = r5;
          break;
        }
        _abort();
      }
    } while (0);
    HEAP32[(r1 + 2 << 2) + 411456 >> 2] = r9;
    HEAP32[r21 + 12 >> 2] = r9;
    HEAP32[r9 + 8 >> 2] = r21;
    HEAP32[r9 + 12 >> 2] = r15;
  }
  HEAP32[102856] = r4;
  HEAP32[102859] = r2;
  r19 = r7 + 8 | 0;
  r20 = r19;
  return r20;
}
function _tmalloc_large(r1) {
  var r2, r3, r4, r5, r6, r7, r8, r9, r10, r11, r12, r13, r14, r15, r16, r17, r18, r19, r20, r21, r22, r23, r24, r25, r26, r27, r28, r29, r30, r31, r32, r33, r34, r35;
  r2 = r1 >> 2;
  r3 = 0;
  r4 = -r1 | 0;
  r5 = r1 >>> 8;
  do {
    if ((r5 | 0) == 0) {
      r6 = 0;
    } else {
      if (r1 >>> 0 > 16777215) {
        r6 = 31;
        break;
      }
      r7 = (r5 + 1048320 | 0) >>> 16 & 8;
      r8 = r5 << r7;
      r9 = (r8 + 520192 | 0) >>> 16 & 4;
      r10 = r8 << r9;
      r8 = (r10 + 245760 | 0) >>> 16 & 2;
      r11 = 14 - (r9 | r7 | r8) + (r10 << r8 >>> 15) | 0;
      r6 = r1 >>> ((r11 + 7 | 0) >>> 0) & 1 | r11 << 1;
    }
  } while (0);
  r5 = HEAP32[(r6 << 2) + 411720 >> 2];
  L1924 : do {
    if ((r5 | 0) == 0) {
      r12 = 0;
      r13 = r4;
      r14 = 0;
    } else {
      if ((r6 | 0) == 31) {
        r15 = 0;
      } else {
        r15 = 25 - (r6 >>> 1) | 0;
      }
      r11 = 0;
      r8 = r4;
      r10 = r5, r7 = r10 >> 2;
      r9 = r1 << r15;
      r16 = 0;
      while (1) {
        r17 = HEAP32[r7 + 1] & -8;
        r18 = r17 - r1 | 0;
        if (r18 >>> 0 < r8 >>> 0) {
          if ((r17 | 0) == (r1 | 0)) {
            r12 = r10;
            r13 = r18;
            r14 = r10;
            break L1924;
          } else {
            r19 = r10;
            r20 = r18;
          }
        } else {
          r19 = r11;
          r20 = r8;
        }
        r18 = HEAP32[r7 + 5];
        r17 = HEAP32[((r9 >>> 31 << 2) + 16 >> 2) + r7];
        r21 = (r18 | 0) == 0 | (r18 | 0) == (r17 | 0) ? r16 : r18;
        if ((r17 | 0) == 0) {
          r12 = r19;
          r13 = r20;
          r14 = r21;
          break L1924;
        } else {
          r11 = r19;
          r8 = r20;
          r10 = r17, r7 = r10 >> 2;
          r9 = r9 << 1;
          r16 = r21;
        }
      }
    }
  } while (0);
  do {
    if ((r14 | 0) == 0 & (r12 | 0) == 0) {
      r20 = 2 << r6;
      r19 = HEAP32[102855] & (r20 | -r20);
      if ((r19 | 0) == 0) {
        r22 = r14;
        break;
      }
      r20 = (r19 & -r19) - 1 | 0;
      r19 = r20 >>> 12 & 16;
      r15 = r20 >>> (r19 >>> 0);
      r20 = r15 >>> 5 & 8;
      r5 = r15 >>> (r20 >>> 0);
      r15 = r5 >>> 2 & 4;
      r4 = r5 >>> (r15 >>> 0);
      r5 = r4 >>> 1 & 2;
      r16 = r4 >>> (r5 >>> 0);
      r4 = r16 >>> 1 & 1;
      r22 = HEAP32[((r20 | r19 | r15 | r5 | r4) + (r16 >>> (r4 >>> 0)) << 2) + 411720 >> 2];
    } else {
      r22 = r14;
    }
  } while (0);
  L1939 : do {
    if ((r22 | 0) == 0) {
      r23 = r13;
      r24 = r12, r25 = r24 >> 2;
    } else {
      r14 = r22, r6 = r14 >> 2;
      r4 = r13;
      r16 = r12;
      while (1) {
        r5 = (HEAP32[r6 + 1] & -8) - r1 | 0;
        r15 = r5 >>> 0 < r4 >>> 0;
        r19 = r15 ? r5 : r4;
        r5 = r15 ? r14 : r16;
        r15 = HEAP32[r6 + 4];
        if ((r15 | 0) != 0) {
          r14 = r15, r6 = r14 >> 2;
          r4 = r19;
          r16 = r5;
          continue;
        }
        r15 = HEAP32[r6 + 5];
        if ((r15 | 0) == 0) {
          r23 = r19;
          r24 = r5, r25 = r24 >> 2;
          break L1939;
        } else {
          r14 = r15, r6 = r14 >> 2;
          r4 = r19;
          r16 = r5;
        }
      }
    }
  } while (0);
  if ((r24 | 0) == 0) {
    r26 = 0;
    return r26;
  }
  if (r23 >>> 0 >= (HEAP32[102856] - r1 | 0) >>> 0) {
    r26 = 0;
    return r26;
  }
  r12 = r24, r13 = r12 >> 2;
  r22 = HEAP32[102858];
  if (r12 >>> 0 < r22 >>> 0) {
    _abort();
  }
  r16 = r12 + r1 | 0;
  r4 = r16;
  if (r12 >>> 0 >= r16 >>> 0) {
    _abort();
  }
  r14 = HEAP32[r25 + 6];
  r6 = HEAP32[r25 + 3];
  L1956 : do {
    if ((r6 | 0) == (r24 | 0)) {
      r5 = r24 + 20 | 0;
      r19 = HEAP32[r5 >> 2];
      do {
        if ((r19 | 0) == 0) {
          r15 = r24 + 16 | 0;
          r20 = HEAP32[r15 >> 2];
          if ((r20 | 0) == 0) {
            r27 = 0, r28 = r27 >> 2;
            break L1956;
          } else {
            r29 = r20;
            r30 = r15;
            break;
          }
        } else {
          r29 = r19;
          r30 = r5;
        }
      } while (0);
      while (1) {
        r5 = r29 + 20 | 0;
        if ((HEAP32[r5 >> 2] | 0) == 0) {
          r19 = r29 + 16 | 0;
          if ((HEAP32[r19 >> 2] | 0) == 0) {
            break;
          } else {
            r31 = r19;
          }
        } else {
          r31 = r5;
        }
        r29 = HEAP32[r31 >> 2];
        r30 = r31;
      }
      if (r30 >>> 0 < HEAP32[102858] >>> 0) {
        _abort();
      } else {
        HEAP32[r30 >> 2] = 0;
        r27 = r29, r28 = r27 >> 2;
        break;
      }
    } else {
      r5 = HEAP32[r25 + 2];
      if (r5 >>> 0 < r22 >>> 0) {
        _abort();
      }
      r19 = r5 + 12 | 0;
      if ((HEAP32[r19 >> 2] | 0) != (r24 | 0)) {
        _abort();
      }
      r15 = r6 + 8 | 0;
      if ((HEAP32[r15 >> 2] | 0) == (r24 | 0)) {
        HEAP32[r19 >> 2] = r6;
        HEAP32[r15 >> 2] = r5;
        r27 = r6, r28 = r27 >> 2;
        break;
      } else {
        _abort();
      }
    }
  } while (0);
  L1980 : do {
    if ((r14 | 0) != 0) {
      r6 = r24 + 28 | 0;
      r22 = (HEAP32[r6 >> 2] << 2) + 411720 | 0;
      do {
        if ((r24 | 0) == (HEAP32[r22 >> 2] | 0)) {
          HEAP32[r22 >> 2] = r27;
          if ((r27 | 0) != 0) {
            break;
          }
          HEAP32[102855] = HEAP32[102855] & (1 << HEAP32[r6 >> 2] ^ -1);
          break L1980;
        } else {
          if (r14 >>> 0 < HEAP32[102858] >>> 0) {
            _abort();
          }
          r29 = r14 + 16 | 0;
          if ((HEAP32[r29 >> 2] | 0) == (r24 | 0)) {
            HEAP32[r29 >> 2] = r27;
          } else {
            HEAP32[r14 + 20 >> 2] = r27;
          }
          if ((r27 | 0) == 0) {
            break L1980;
          }
        }
      } while (0);
      if (r27 >>> 0 < HEAP32[102858] >>> 0) {
        _abort();
      }
      HEAP32[r28 + 6] = r14;
      r6 = HEAP32[r25 + 4];
      do {
        if ((r6 | 0) != 0) {
          if (r6 >>> 0 < HEAP32[102858] >>> 0) {
            _abort();
          } else {
            HEAP32[r28 + 4] = r6;
            HEAP32[r6 + 24 >> 2] = r27;
            break;
          }
        }
      } while (0);
      r6 = HEAP32[r25 + 5];
      if ((r6 | 0) == 0) {
        break;
      }
      if (r6 >>> 0 < HEAP32[102858] >>> 0) {
        _abort();
      } else {
        HEAP32[r28 + 5] = r6;
        HEAP32[r6 + 24 >> 2] = r27;
        break;
      }
    }
  } while (0);
  do {
    if (r23 >>> 0 < 16) {
      r27 = r23 + r1 | 0;
      HEAP32[r25 + 1] = r27 | 3;
      r28 = r27 + (r12 + 4) | 0;
      HEAP32[r28 >> 2] = HEAP32[r28 >> 2] | 1;
    } else {
      HEAP32[r25 + 1] = r1 | 3;
      HEAP32[r2 + (r13 + 1)] = r23 | 1;
      HEAP32[(r23 >> 2) + r13 + r2] = r23;
      r28 = r23 >>> 3;
      if (r23 >>> 0 < 256) {
        r27 = r28 << 1;
        r14 = (r27 << 2) + 411456 | 0;
        r6 = HEAP32[102854];
        r22 = 1 << r28;
        do {
          if ((r6 & r22 | 0) == 0) {
            HEAP32[102854] = r6 | r22;
            r32 = r14;
          } else {
            r28 = HEAP32[(r27 + 2 << 2) + 411456 >> 2];
            if (r28 >>> 0 >= HEAP32[102858] >>> 0) {
              r32 = r28;
              break;
            }
            _abort();
          }
        } while (0);
        HEAP32[(r27 + 2 << 2) + 411456 >> 2] = r4;
        HEAP32[r32 + 12 >> 2] = r4;
        HEAP32[r2 + (r13 + 2)] = r32;
        HEAP32[r2 + (r13 + 3)] = r14;
        break;
      }
      r22 = r16;
      r6 = r23 >>> 8;
      do {
        if ((r6 | 0) == 0) {
          r33 = 0;
        } else {
          if (r23 >>> 0 > 16777215) {
            r33 = 31;
            break;
          }
          r28 = (r6 + 1048320 | 0) >>> 16 & 8;
          r29 = r6 << r28;
          r30 = (r29 + 520192 | 0) >>> 16 & 4;
          r31 = r29 << r30;
          r29 = (r31 + 245760 | 0) >>> 16 & 2;
          r5 = 14 - (r30 | r28 | r29) + (r31 << r29 >>> 15) | 0;
          r33 = r23 >>> ((r5 + 7 | 0) >>> 0) & 1 | r5 << 1;
        }
      } while (0);
      r6 = (r33 << 2) + 411720 | 0;
      HEAP32[r2 + (r13 + 7)] = r33;
      HEAP32[r2 + (r13 + 5)] = 0;
      HEAP32[r2 + (r13 + 4)] = 0;
      r14 = HEAP32[102855];
      r27 = 1 << r33;
      if ((r14 & r27 | 0) == 0) {
        HEAP32[102855] = r14 | r27;
        HEAP32[r6 >> 2] = r22;
        HEAP32[r2 + (r13 + 6)] = r6;
        HEAP32[r2 + (r13 + 3)] = r22;
        HEAP32[r2 + (r13 + 2)] = r22;
        break;
      }
      if ((r33 | 0) == 31) {
        r34 = 0;
      } else {
        r34 = 25 - (r33 >>> 1) | 0;
      }
      r27 = r23 << r34;
      r14 = HEAP32[r6 >> 2];
      while (1) {
        if ((HEAP32[r14 + 4 >> 2] & -8 | 0) == (r23 | 0)) {
          break;
        }
        r35 = (r27 >>> 31 << 2) + r14 + 16 | 0;
        r6 = HEAP32[r35 >> 2];
        if ((r6 | 0) == 0) {
          r3 = 1552;
          break;
        } else {
          r27 = r27 << 1;
          r14 = r6;
        }
      }
      if (r3 == 1552) {
        if (r35 >>> 0 < HEAP32[102858] >>> 0) {
          _abort();
        } else {
          HEAP32[r35 >> 2] = r22;
          HEAP32[r2 + (r13 + 6)] = r14;
          HEAP32[r2 + (r13 + 3)] = r22;
          HEAP32[r2 + (r13 + 2)] = r22;
          break;
        }
      }
      r27 = r14 + 8 | 0;
      r6 = HEAP32[r27 >> 2];
      r5 = HEAP32[102858];
      if (r14 >>> 0 < r5 >>> 0) {
        _abort();
      }
      if (r6 >>> 0 < r5 >>> 0) {
        _abort();
      } else {
        HEAP32[r6 + 12 >> 2] = r22;
        HEAP32[r27 >> 2] = r22;
        HEAP32[r2 + (r13 + 2)] = r6;
        HEAP32[r2 + (r13 + 3)] = r14;
        HEAP32[r2 + (r13 + 6)] = 0;
        break;
      }
    }
  } while (0);
  r26 = r24 + 8 | 0;
  return r26;
}
function _sys_alloc(r1) {
  var r2, r3, r4, r5, r6, r7, r8, r9, r10, r11, r12, r13, r14, r15, r16, r17, r18, r19, r20, r21, r22, r23, r24, r25, r26;
  r2 = 0;
  if ((HEAP32[102455] | 0) == 0) {
    _init_mparams();
  }
  r3 = r1 + 48 | 0;
  r4 = HEAP32[102457];
  r5 = r4 + (r1 + 47) & -r4;
  if (r5 >>> 0 <= r1 >>> 0) {
    r6 = 0;
    return r6;
  }
  r4 = HEAP32[102964];
  do {
    if ((r4 | 0) != 0) {
      r7 = HEAP32[102962];
      r8 = r7 + r5 | 0;
      if (r8 >>> 0 <= r7 >>> 0 | r8 >>> 0 > r4 >>> 0) {
        r6 = 0;
      } else {
        break;
      }
      return r6;
    }
  } while (0);
  L2057 : do {
    if ((HEAP32[102965] & 4 | 0) == 0) {
      r4 = HEAP32[102860];
      do {
        if ((r4 | 0) == 0) {
          r2 = 1580;
        } else {
          r8 = _segment_holding(r4);
          if ((r8 | 0) == 0) {
            r2 = 1580;
            break;
          }
          r7 = HEAP32[102457];
          r9 = r1 + 47 - HEAP32[102857] + r7 & -r7;
          if (r9 >>> 0 >= 2147483647) {
            r10 = 0;
            break;
          }
          r7 = _sbrk(r9);
          r11 = (r7 | 0) == (HEAP32[r8 >> 2] + HEAP32[r8 + 4 >> 2] | 0);
          r12 = r11 ? r7 : -1;
          r13 = r11 ? r9 : 0;
          r14 = r7;
          r15 = r9;
          r2 = 1589;
          break;
        }
      } while (0);
      do {
        if (r2 == 1580) {
          r4 = _sbrk(0);
          if ((r4 | 0) == -1) {
            r10 = 0;
            break;
          }
          r9 = r4;
          r7 = HEAP32[102456];
          r11 = r7 - 1 | 0;
          if ((r11 & r9 | 0) == 0) {
            r16 = r5;
          } else {
            r16 = r5 - r9 + (r11 + r9 & -r7) | 0;
          }
          r7 = HEAP32[102962];
          r9 = r7 + r16 | 0;
          if (!(r16 >>> 0 > r1 >>> 0 & r16 >>> 0 < 2147483647)) {
            r10 = 0;
            break;
          }
          r11 = HEAP32[102964];
          if ((r11 | 0) != 0) {
            if (r9 >>> 0 <= r7 >>> 0 | r9 >>> 0 > r11 >>> 0) {
              r10 = 0;
              break;
            }
          }
          r11 = _sbrk(r16);
          r9 = (r11 | 0) == (r4 | 0);
          r12 = r9 ? r4 : -1;
          r13 = r9 ? r16 : 0;
          r14 = r11;
          r15 = r16;
          r2 = 1589;
          break;
        }
      } while (0);
      L2073 : do {
        if (r2 == 1589) {
          r11 = -r15 | 0;
          if ((r12 | 0) != -1) {
            r17 = r13;
            r18 = r12;
            r2 = 1600;
            break L2057;
          }
          do {
            if ((r14 | 0) != -1 & r15 >>> 0 < 2147483647 & r15 >>> 0 < r3 >>> 0) {
              r9 = HEAP32[102457];
              r4 = r1 + 47 - r15 + r9 & -r9;
              if (r4 >>> 0 >= 2147483647) {
                r19 = r15;
                break;
              }
              if ((_sbrk(r4) | 0) == -1) {
                _sbrk(r11);
                r10 = r13;
                break L2073;
              } else {
                r19 = r4 + r15 | 0;
                break;
              }
            } else {
              r19 = r15;
            }
          } while (0);
          if ((r14 | 0) == -1) {
            r10 = r13;
          } else {
            r17 = r19;
            r18 = r14;
            r2 = 1600;
            break L2057;
          }
        }
      } while (0);
      HEAP32[102965] = HEAP32[102965] | 4;
      r20 = r10;
      r2 = 1597;
      break;
    } else {
      r20 = 0;
      r2 = 1597;
    }
  } while (0);
  do {
    if (r2 == 1597) {
      if (r5 >>> 0 >= 2147483647) {
        break;
      }
      r10 = _sbrk(r5);
      r14 = _sbrk(0);
      if (!((r14 | 0) != -1 & (r10 | 0) != -1 & r10 >>> 0 < r14 >>> 0)) {
        break;
      }
      r19 = r14 - r10 | 0;
      r14 = r19 >>> 0 > (r1 + 40 | 0) >>> 0;
      r13 = r14 ? r10 : -1;
      if ((r13 | 0) == -1) {
        break;
      } else {
        r17 = r14 ? r19 : r20;
        r18 = r13;
        r2 = 1600;
        break;
      }
    }
  } while (0);
  do {
    if (r2 == 1600) {
      r20 = HEAP32[102962] + r17 | 0;
      HEAP32[102962] = r20;
      if (r20 >>> 0 > HEAP32[102963] >>> 0) {
        HEAP32[102963] = r20;
      }
      L2093 : do {
        if ((HEAP32[102860] | 0) == 0) {
          r20 = HEAP32[102858];
          if ((r20 | 0) == 0 | r18 >>> 0 < r20 >>> 0) {
            HEAP32[102858] = r18;
          }
          HEAP32[102966] = r18;
          HEAP32[102967] = r17;
          HEAP32[102969] = 0;
          HEAP32[102863] = HEAP32[102455];
          HEAP32[102862] = -1;
          _init_bins();
          _init_top(r18, r17 - 40 | 0);
        } else {
          r20 = 411864, r5 = r20 >> 2;
          while (1) {
            r21 = HEAP32[r5];
            r22 = r20 + 4 | 0;
            r23 = HEAP32[r22 >> 2];
            r24 = r21 + r23 | 0;
            if ((r18 | 0) == (r24 | 0)) {
              r2 = 1608;
              break;
            }
            r13 = HEAP32[r5 + 2];
            if ((r13 | 0) == 0) {
              break;
            } else {
              r20 = r13, r5 = r20 >> 2;
            }
          }
          do {
            if (r2 == 1608) {
              if ((HEAP32[r5 + 3] & 8 | 0) != 0) {
                break;
              }
              r20 = HEAP32[102860];
              if (!(r20 >>> 0 >= r21 >>> 0 & r20 >>> 0 < r24 >>> 0)) {
                break;
              }
              HEAP32[r22 >> 2] = r23 + r17 | 0;
              _init_top(HEAP32[102860], HEAP32[102857] + r17 | 0);
              break L2093;
            }
          } while (0);
          if (r18 >>> 0 < HEAP32[102858] >>> 0) {
            HEAP32[102858] = r18;
          }
          r5 = r18 + r17 | 0;
          r20 = 411864;
          while (1) {
            r25 = r20 | 0;
            r26 = HEAP32[r25 >> 2];
            if ((r26 | 0) == (r5 | 0)) {
              r2 = 1616;
              break;
            }
            r13 = HEAP32[r20 + 8 >> 2];
            if ((r13 | 0) == 0) {
              break;
            } else {
              r20 = r13;
            }
          }
          do {
            if (r2 == 1616) {
              if ((HEAP32[r20 + 12 >> 2] & 8 | 0) != 0) {
                break;
              }
              HEAP32[r25 >> 2] = r18;
              r5 = r20 + 4 | 0;
              HEAP32[r5 >> 2] = HEAP32[r5 >> 2] + r17 | 0;
              r6 = _prepend_alloc(r18, r26, r1);
              return r6;
            }
          } while (0);
          _add_segment(r18, r17);
        }
      } while (0);
      r20 = HEAP32[102857];
      if (r20 >>> 0 <= r1 >>> 0) {
        break;
      }
      r5 = r20 - r1 | 0;
      HEAP32[102857] = r5;
      r20 = HEAP32[102860];
      r13 = r20;
      HEAP32[102860] = r13 + r1 | 0;
      HEAP32[r1 + (r13 + 4) >> 2] = r5 | 1;
      HEAP32[r20 + 4 >> 2] = r1 | 3;
      r6 = r20 + 8 | 0;
      return r6;
    }
  } while (0);
  HEAP32[___errno_location() >> 2] = 12;
  r6 = 0;
  return r6;
}
function _free(r1) {
  var r2, r3, r4, r5, r6, r7, r8, r9, r10, r11, r12, r13, r14, r15, r16, r17, r18, r19, r20, r21, r22, r23, r24, r25, r26, r27, r28, r29, r30, r31, r32, r33, r34, r35, r36, r37, r38, r39, r40, r41, r42, r43, r44;
  r2 = r1 >> 2;
  r3 = 0;
  if ((r1 | 0) == 0) {
    return;
  }
  r4 = r1 - 8 | 0;
  r5 = r4;
  r6 = HEAP32[102858];
  if (r4 >>> 0 < r6 >>> 0) {
    _abort();
  }
  r7 = HEAP32[r1 - 4 >> 2];
  r8 = r7 & 3;
  if ((r8 | 0) == 1) {
    _abort();
  }
  r9 = r7 & -8, r10 = r9 >> 2;
  r11 = r1 + (r9 - 8) | 0;
  r12 = r11;
  L2132 : do {
    if ((r7 & 1 | 0) == 0) {
      r13 = HEAP32[r4 >> 2];
      if ((r8 | 0) == 0) {
        return;
      }
      r14 = -8 - r13 | 0, r15 = r14 >> 2;
      r16 = r1 + r14 | 0;
      r17 = r16;
      r18 = r13 + r9 | 0;
      if (r16 >>> 0 < r6 >>> 0) {
        _abort();
      }
      if ((r17 | 0) == (HEAP32[102859] | 0)) {
        r19 = (r1 + (r9 - 4) | 0) >> 2;
        if ((HEAP32[r19] & 3 | 0) != 3) {
          r20 = r17, r21 = r20 >> 2;
          r22 = r18;
          break;
        }
        HEAP32[102856] = r18;
        HEAP32[r19] = HEAP32[r19] & -2;
        HEAP32[r15 + (r2 + 1)] = r18 | 1;
        HEAP32[r11 >> 2] = r18;
        return;
      }
      r19 = r13 >>> 3;
      if (r13 >>> 0 < 256) {
        r13 = HEAP32[r15 + (r2 + 2)];
        r23 = HEAP32[r15 + (r2 + 3)];
        r24 = (r19 << 3) + 411456 | 0;
        do {
          if ((r13 | 0) != (r24 | 0)) {
            if (r13 >>> 0 < r6 >>> 0) {
              _abort();
            }
            if ((HEAP32[r13 + 12 >> 2] | 0) == (r17 | 0)) {
              break;
            }
            _abort();
          }
        } while (0);
        if ((r23 | 0) == (r13 | 0)) {
          HEAP32[102854] = HEAP32[102854] & (1 << r19 ^ -1);
          r20 = r17, r21 = r20 >> 2;
          r22 = r18;
          break;
        }
        do {
          if ((r23 | 0) != (r24 | 0)) {
            if (r23 >>> 0 < HEAP32[102858] >>> 0) {
              _abort();
            }
            if ((HEAP32[r23 + 8 >> 2] | 0) == (r17 | 0)) {
              break;
            }
            _abort();
          }
        } while (0);
        HEAP32[r13 + 12 >> 2] = r23;
        HEAP32[r23 + 8 >> 2] = r13;
        r20 = r17, r21 = r20 >> 2;
        r22 = r18;
        break;
      }
      r24 = r16;
      r19 = HEAP32[r15 + (r2 + 6)];
      r25 = HEAP32[r15 + (r2 + 3)];
      L2165 : do {
        if ((r25 | 0) == (r24 | 0)) {
          r26 = r14 + (r1 + 20) | 0;
          r27 = HEAP32[r26 >> 2];
          do {
            if ((r27 | 0) == 0) {
              r28 = r14 + (r1 + 16) | 0;
              r29 = HEAP32[r28 >> 2];
              if ((r29 | 0) == 0) {
                r30 = 0, r31 = r30 >> 2;
                break L2165;
              } else {
                r32 = r29;
                r33 = r28;
                break;
              }
            } else {
              r32 = r27;
              r33 = r26;
            }
          } while (0);
          while (1) {
            r26 = r32 + 20 | 0;
            if ((HEAP32[r26 >> 2] | 0) == 0) {
              r27 = r32 + 16 | 0;
              if ((HEAP32[r27 >> 2] | 0) == 0) {
                break;
              } else {
                r34 = r27;
              }
            } else {
              r34 = r26;
            }
            r32 = HEAP32[r34 >> 2];
            r33 = r34;
          }
          if (r33 >>> 0 < HEAP32[102858] >>> 0) {
            _abort();
          } else {
            HEAP32[r33 >> 2] = 0;
            r30 = r32, r31 = r30 >> 2;
            break;
          }
        } else {
          r26 = HEAP32[r15 + (r2 + 2)];
          if (r26 >>> 0 < r6 >>> 0) {
            _abort();
          }
          r27 = r26 + 12 | 0;
          if ((HEAP32[r27 >> 2] | 0) != (r24 | 0)) {
            _abort();
          }
          r28 = r25 + 8 | 0;
          if ((HEAP32[r28 >> 2] | 0) == (r24 | 0)) {
            HEAP32[r27 >> 2] = r25;
            HEAP32[r28 >> 2] = r26;
            r30 = r25, r31 = r30 >> 2;
            break;
          } else {
            _abort();
          }
        }
      } while (0);
      if ((r19 | 0) == 0) {
        r20 = r17, r21 = r20 >> 2;
        r22 = r18;
        break;
      }
      r25 = r14 + (r1 + 28) | 0;
      r16 = (HEAP32[r25 >> 2] << 2) + 411720 | 0;
      do {
        if ((r24 | 0) == (HEAP32[r16 >> 2] | 0)) {
          HEAP32[r16 >> 2] = r30;
          if ((r30 | 0) != 0) {
            break;
          }
          HEAP32[102855] = HEAP32[102855] & (1 << HEAP32[r25 >> 2] ^ -1);
          r20 = r17, r21 = r20 >> 2;
          r22 = r18;
          break L2132;
        } else {
          if (r19 >>> 0 < HEAP32[102858] >>> 0) {
            _abort();
          }
          r13 = r19 + 16 | 0;
          if ((HEAP32[r13 >> 2] | 0) == (r24 | 0)) {
            HEAP32[r13 >> 2] = r30;
          } else {
            HEAP32[r19 + 20 >> 2] = r30;
          }
          if ((r30 | 0) == 0) {
            r20 = r17, r21 = r20 >> 2;
            r22 = r18;
            break L2132;
          }
        }
      } while (0);
      if (r30 >>> 0 < HEAP32[102858] >>> 0) {
        _abort();
      }
      HEAP32[r31 + 6] = r19;
      r24 = HEAP32[r15 + (r2 + 4)];
      do {
        if ((r24 | 0) != 0) {
          if (r24 >>> 0 < HEAP32[102858] >>> 0) {
            _abort();
          } else {
            HEAP32[r31 + 4] = r24;
            HEAP32[r24 + 24 >> 2] = r30;
            break;
          }
        }
      } while (0);
      r24 = HEAP32[r15 + (r2 + 5)];
      if ((r24 | 0) == 0) {
        r20 = r17, r21 = r20 >> 2;
        r22 = r18;
        break;
      }
      if (r24 >>> 0 < HEAP32[102858] >>> 0) {
        _abort();
      } else {
        HEAP32[r31 + 5] = r24;
        HEAP32[r24 + 24 >> 2] = r30;
        r20 = r17, r21 = r20 >> 2;
        r22 = r18;
        break;
      }
    } else {
      r20 = r5, r21 = r20 >> 2;
      r22 = r9;
    }
  } while (0);
  r5 = r20, r30 = r5 >> 2;
  if (r5 >>> 0 >= r11 >>> 0) {
    _abort();
  }
  r5 = r1 + (r9 - 4) | 0;
  r31 = HEAP32[r5 >> 2];
  if ((r31 & 1 | 0) == 0) {
    _abort();
  }
  do {
    if ((r31 & 2 | 0) == 0) {
      if ((r12 | 0) == (HEAP32[102860] | 0)) {
        r6 = HEAP32[102857] + r22 | 0;
        HEAP32[102857] = r6;
        HEAP32[102860] = r20;
        HEAP32[r21 + 1] = r6 | 1;
        if ((r20 | 0) == (HEAP32[102859] | 0)) {
          HEAP32[102859] = 0;
          HEAP32[102856] = 0;
        }
        if (r6 >>> 0 <= HEAP32[102861] >>> 0) {
          return;
        }
        _sys_trim(0);
        return;
      }
      if ((r12 | 0) == (HEAP32[102859] | 0)) {
        r6 = HEAP32[102856] + r22 | 0;
        HEAP32[102856] = r6;
        HEAP32[102859] = r20;
        HEAP32[r21 + 1] = r6 | 1;
        HEAP32[(r6 >> 2) + r30] = r6;
        return;
      }
      r6 = (r31 & -8) + r22 | 0;
      r32 = r31 >>> 3;
      L2239 : do {
        if (r31 >>> 0 < 256) {
          r33 = HEAP32[r2 + r10];
          r34 = HEAP32[((r9 | 4) >> 2) + r2];
          r8 = (r32 << 3) + 411456 | 0;
          do {
            if ((r33 | 0) != (r8 | 0)) {
              if (r33 >>> 0 < HEAP32[102858] >>> 0) {
                _abort();
              }
              if ((HEAP32[r33 + 12 >> 2] | 0) == (r12 | 0)) {
                break;
              }
              _abort();
            }
          } while (0);
          if ((r34 | 0) == (r33 | 0)) {
            HEAP32[102854] = HEAP32[102854] & (1 << r32 ^ -1);
            break;
          }
          do {
            if ((r34 | 0) != (r8 | 0)) {
              if (r34 >>> 0 < HEAP32[102858] >>> 0) {
                _abort();
              }
              if ((HEAP32[r34 + 8 >> 2] | 0) == (r12 | 0)) {
                break;
              }
              _abort();
            }
          } while (0);
          HEAP32[r33 + 12 >> 2] = r34;
          HEAP32[r34 + 8 >> 2] = r33;
        } else {
          r8 = r11;
          r4 = HEAP32[r10 + (r2 + 4)];
          r7 = HEAP32[((r9 | 4) >> 2) + r2];
          L2241 : do {
            if ((r7 | 0) == (r8 | 0)) {
              r24 = r9 + (r1 + 12) | 0;
              r19 = HEAP32[r24 >> 2];
              do {
                if ((r19 | 0) == 0) {
                  r25 = r9 + (r1 + 8) | 0;
                  r16 = HEAP32[r25 >> 2];
                  if ((r16 | 0) == 0) {
                    r35 = 0, r36 = r35 >> 2;
                    break L2241;
                  } else {
                    r37 = r16;
                    r38 = r25;
                    break;
                  }
                } else {
                  r37 = r19;
                  r38 = r24;
                }
              } while (0);
              while (1) {
                r24 = r37 + 20 | 0;
                if ((HEAP32[r24 >> 2] | 0) == 0) {
                  r19 = r37 + 16 | 0;
                  if ((HEAP32[r19 >> 2] | 0) == 0) {
                    break;
                  } else {
                    r39 = r19;
                  }
                } else {
                  r39 = r24;
                }
                r37 = HEAP32[r39 >> 2];
                r38 = r39;
              }
              if (r38 >>> 0 < HEAP32[102858] >>> 0) {
                _abort();
              } else {
                HEAP32[r38 >> 2] = 0;
                r35 = r37, r36 = r35 >> 2;
                break;
              }
            } else {
              r24 = HEAP32[r2 + r10];
              if (r24 >>> 0 < HEAP32[102858] >>> 0) {
                _abort();
              }
              r19 = r24 + 12 | 0;
              if ((HEAP32[r19 >> 2] | 0) != (r8 | 0)) {
                _abort();
              }
              r25 = r7 + 8 | 0;
              if ((HEAP32[r25 >> 2] | 0) == (r8 | 0)) {
                HEAP32[r19 >> 2] = r7;
                HEAP32[r25 >> 2] = r24;
                r35 = r7, r36 = r35 >> 2;
                break;
              } else {
                _abort();
              }
            }
          } while (0);
          if ((r4 | 0) == 0) {
            break;
          }
          r7 = r9 + (r1 + 20) | 0;
          r33 = (HEAP32[r7 >> 2] << 2) + 411720 | 0;
          do {
            if ((r8 | 0) == (HEAP32[r33 >> 2] | 0)) {
              HEAP32[r33 >> 2] = r35;
              if ((r35 | 0) != 0) {
                break;
              }
              HEAP32[102855] = HEAP32[102855] & (1 << HEAP32[r7 >> 2] ^ -1);
              break L2239;
            } else {
              if (r4 >>> 0 < HEAP32[102858] >>> 0) {
                _abort();
              }
              r34 = r4 + 16 | 0;
              if ((HEAP32[r34 >> 2] | 0) == (r8 | 0)) {
                HEAP32[r34 >> 2] = r35;
              } else {
                HEAP32[r4 + 20 >> 2] = r35;
              }
              if ((r35 | 0) == 0) {
                break L2239;
              }
            }
          } while (0);
          if (r35 >>> 0 < HEAP32[102858] >>> 0) {
            _abort();
          }
          HEAP32[r36 + 6] = r4;
          r8 = HEAP32[r10 + (r2 + 2)];
          do {
            if ((r8 | 0) != 0) {
              if (r8 >>> 0 < HEAP32[102858] >>> 0) {
                _abort();
              } else {
                HEAP32[r36 + 4] = r8;
                HEAP32[r8 + 24 >> 2] = r35;
                break;
              }
            }
          } while (0);
          r8 = HEAP32[r10 + (r2 + 3)];
          if ((r8 | 0) == 0) {
            break;
          }
          if (r8 >>> 0 < HEAP32[102858] >>> 0) {
            _abort();
          } else {
            HEAP32[r36 + 5] = r8;
            HEAP32[r8 + 24 >> 2] = r35;
            break;
          }
        }
      } while (0);
      HEAP32[r21 + 1] = r6 | 1;
      HEAP32[(r6 >> 2) + r30] = r6;
      if ((r20 | 0) != (HEAP32[102859] | 0)) {
        r40 = r6;
        break;
      }
      HEAP32[102856] = r6;
      return;
    } else {
      HEAP32[r5 >> 2] = r31 & -2;
      HEAP32[r21 + 1] = r22 | 1;
      HEAP32[(r22 >> 2) + r30] = r22;
      r40 = r22;
    }
  } while (0);
  r22 = r40 >>> 3;
  if (r40 >>> 0 < 256) {
    r30 = r22 << 1;
    r31 = (r30 << 2) + 411456 | 0;
    r5 = HEAP32[102854];
    r35 = 1 << r22;
    do {
      if ((r5 & r35 | 0) == 0) {
        HEAP32[102854] = r5 | r35;
        r41 = r31;
      } else {
        r22 = HEAP32[(r30 + 2 << 2) + 411456 >> 2];
        if (r22 >>> 0 >= HEAP32[102858] >>> 0) {
          r41 = r22;
          break;
        }
        _abort();
      }
    } while (0);
    HEAP32[(r30 + 2 << 2) + 411456 >> 2] = r20;
    HEAP32[r41 + 12 >> 2] = r20;
    HEAP32[r21 + 2] = r41;
    HEAP32[r21 + 3] = r31;
    return;
  }
  r31 = r20;
  r41 = r40 >>> 8;
  do {
    if ((r41 | 0) == 0) {
      r42 = 0;
    } else {
      if (r40 >>> 0 > 16777215) {
        r42 = 31;
        break;
      }
      r30 = (r41 + 1048320 | 0) >>> 16 & 8;
      r35 = r41 << r30;
      r5 = (r35 + 520192 | 0) >>> 16 & 4;
      r22 = r35 << r5;
      r35 = (r22 + 245760 | 0) >>> 16 & 2;
      r36 = 14 - (r5 | r30 | r35) + (r22 << r35 >>> 15) | 0;
      r42 = r40 >>> ((r36 + 7 | 0) >>> 0) & 1 | r36 << 1;
    }
  } while (0);
  r41 = (r42 << 2) + 411720 | 0;
  HEAP32[r21 + 7] = r42;
  HEAP32[r21 + 5] = 0;
  HEAP32[r21 + 4] = 0;
  r36 = HEAP32[102855];
  r35 = 1 << r42;
  do {
    if ((r36 & r35 | 0) == 0) {
      HEAP32[102855] = r36 | r35;
      HEAP32[r41 >> 2] = r31;
      HEAP32[r21 + 6] = r41;
      HEAP32[r21 + 3] = r20;
      HEAP32[r21 + 2] = r20;
    } else {
      if ((r42 | 0) == 31) {
        r43 = 0;
      } else {
        r43 = 25 - (r42 >>> 1) | 0;
      }
      r22 = r40 << r43;
      r30 = HEAP32[r41 >> 2];
      while (1) {
        if ((HEAP32[r30 + 4 >> 2] & -8 | 0) == (r40 | 0)) {
          break;
        }
        r44 = (r22 >>> 31 << 2) + r30 + 16 | 0;
        r5 = HEAP32[r44 >> 2];
        if ((r5 | 0) == 0) {
          r3 = 1758;
          break;
        } else {
          r22 = r22 << 1;
          r30 = r5;
        }
      }
      if (r3 == 1758) {
        if (r44 >>> 0 < HEAP32[102858] >>> 0) {
          _abort();
        } else {
          HEAP32[r44 >> 2] = r31;
          HEAP32[r21 + 6] = r30;
          HEAP32[r21 + 3] = r20;
          HEAP32[r21 + 2] = r20;
          break;
        }
      }
      r22 = r30 + 8 | 0;
      r6 = HEAP32[r22 >> 2];
      r5 = HEAP32[102858];
      if (r30 >>> 0 < r5 >>> 0) {
        _abort();
      }
      if (r6 >>> 0 < r5 >>> 0) {
        _abort();
      } else {
        HEAP32[r6 + 12 >> 2] = r31;
        HEAP32[r22 >> 2] = r31;
        HEAP32[r21 + 2] = r6;
        HEAP32[r21 + 3] = r30;
        HEAP32[r21 + 6] = 0;
        break;
      }
    }
  } while (0);
  r21 = HEAP32[102862] - 1 | 0;
  HEAP32[102862] = r21;
  if ((r21 | 0) != 0) {
    return;
  }
  _release_unused_segments();
  return;
}
function _release_unused_segments() {
  var r1, r2;
  r1 = 411872;
  while (1) {
    r2 = HEAP32[r1 >> 2];
    if ((r2 | 0) == 0) {
      break;
    } else {
      r1 = r2 + 8 | 0;
    }
  }
  HEAP32[102862] = -1;
  return;
}
function _sys_trim(r1) {
  var r2, r3, r4, r5, r6, r7, r8, r9, r10;
  if ((HEAP32[102455] | 0) == 0) {
    _init_mparams();
  }
  if (r1 >>> 0 >= 4294967232) {
    r2 = 0;
    r3 = r2 & 1;
    return r3;
  }
  r4 = HEAP32[102860];
  if ((r4 | 0) == 0) {
    r2 = 0;
    r3 = r2 & 1;
    return r3;
  }
  r5 = HEAP32[102857];
  do {
    if (r5 >>> 0 > (r1 + 40 | 0) >>> 0) {
      r6 = HEAP32[102457];
      r7 = Math.imul(Math.floor(((-40 - r1 - 1 + r5 + r6 | 0) >>> 0) / (r6 >>> 0)) - 1 | 0, r6);
      r8 = _segment_holding(r4), r9 = r8 >> 2;
      if ((HEAP32[r9 + 3] & 8 | 0) != 0) {
        break;
      }
      r10 = _sbrk(0);
      if ((r10 | 0) != (HEAP32[r9] + HEAP32[r9 + 1] | 0)) {
        break;
      }
      r9 = _sbrk(-(r7 >>> 0 > 2147483646 ? -2147483648 - r6 | 0 : r7) | 0);
      r7 = _sbrk(0);
      if (!((r9 | 0) != -1 & r7 >>> 0 < r10 >>> 0)) {
        break;
      }
      r9 = r10 - r7 | 0;
      if ((r10 | 0) == (r7 | 0)) {
        break;
      }
      r6 = r8 + 4 | 0;
      HEAP32[r6 >> 2] = HEAP32[r6 >> 2] - r9 | 0;
      HEAP32[102962] = HEAP32[102962] - r9 | 0;
      _init_top(HEAP32[102860], HEAP32[102857] - r9 | 0);
      r2 = (r10 | 0) != (r7 | 0);
      r3 = r2 & 1;
      return r3;
    }
  } while (0);
  if (HEAP32[102857] >>> 0 <= HEAP32[102861] >>> 0) {
    r2 = 0;
    r3 = r2 & 1;
    return r3;
  }
  HEAP32[102861] = -1;
  r2 = 0;
  r3 = r2 & 1;
  return r3;
}
function _calloc(r1, r2) {
  var r3, r4;
  do {
    if ((r1 | 0) == 0) {
      r3 = 0;
    } else {
      r4 = Math.imul(r2, r1);
      if ((r2 | r1) >>> 0 <= 65535) {
        r3 = r4;
        break;
      }
      r3 = (Math.floor((r4 >>> 0) / (r1 >>> 0)) | 0) == (r2 | 0) ? r4 : -1;
    }
  } while (0);
  r2 = _malloc(r3);
  if ((r2 | 0) == 0) {
    return r2;
  }
  if ((HEAP32[r2 - 4 >> 2] & 3 | 0) == 0) {
    return r2;
  }
  _memset(r2, 0, r3);
  return r2;
}
function _realloc(r1, r2) {
  var r3, r4, r5, r6;
  if ((r1 | 0) == 0) {
    r3 = _malloc(r2);
    return r3;
  }
  if (r2 >>> 0 > 4294967231) {
    HEAP32[___errno_location() >> 2] = 12;
    r3 = 0;
    return r3;
  }
  if (r2 >>> 0 < 11) {
    r4 = 16;
  } else {
    r4 = r2 + 11 & -8;
  }
  r5 = _try_realloc_chunk(r1 - 8 | 0, r4);
  if ((r5 | 0) != 0) {
    r3 = r5 + 8 | 0;
    return r3;
  }
  r5 = _malloc(r2);
  if ((r5 | 0) == 0) {
    r3 = 0;
    return r3;
  }
  r4 = HEAP32[r1 - 4 >> 2];
  r6 = (r4 & -8) - ((r4 & 3 | 0) == 0 ? 8 : 4) | 0;
  _memcpy(r5, r1, r6 >>> 0 < r2 >>> 0 ? r6 : r2);
  _free(r1);
  r3 = r5;
  return r3;
}
function _realloc_in_place(r1, r2) {
  var r3;
  if ((r1 | 0) == 0) {
    return 0;
  }
  if (r2 >>> 0 > 4294967231) {
    HEAP32[___errno_location() >> 2] = 12;
    return 0;
  }
  if (r2 >>> 0 < 11) {
    r3 = 16;
  } else {
    r3 = r2 + 11 & -8;
  }
  r2 = r1 - 8 | 0;
  return (_try_realloc_chunk(r2, r3) | 0) == (r2 | 0) ? r1 : 0;
}
function _memalign(r1, r2) {
  var r3;
  if (r1 >>> 0 < 9) {
    r3 = _malloc(r2);
    return r3;
  } else {
    r3 = _internal_memalign(r1, r2);
    return r3;
  }
}
function _internal_memalign(r1, r2) {
  var r3, r4, r5, r6, r7, r8, r9, r10, r11, r12, r13, r14;
  r3 = r1 >>> 0 < 16 ? 16 : r1;
  L2428 : do {
    if ((r3 - 1 & r3 | 0) == 0) {
      r4 = r3;
    } else {
      r1 = 16;
      while (1) {
        if (r1 >>> 0 < r3 >>> 0) {
          r1 = r1 << 1;
        } else {
          r4 = r1;
          break L2428;
        }
      }
    }
  } while (0);
  if ((-64 - r4 | 0) >>> 0 <= r2 >>> 0) {
    HEAP32[___errno_location() >> 2] = 12;
    r5 = 0;
    return r5;
  }
  if (r2 >>> 0 < 11) {
    r6 = 16;
  } else {
    r6 = r2 + 11 & -8;
  }
  r2 = _malloc(r6 + (r4 + 12) | 0);
  if ((r2 | 0) == 0) {
    r5 = 0;
    return r5;
  }
  r3 = r2 - 8 | 0;
  r1 = r3;
  r7 = r4 - 1 | 0;
  do {
    if ((r2 & r7 | 0) == 0) {
      r8 = r1;
    } else {
      r9 = r2 + r7 & -r4;
      r10 = r9 - 8 | 0;
      r11 = r3;
      if ((r10 - r11 | 0) >>> 0 > 15) {
        r12 = r10;
      } else {
        r12 = r9 + (r4 - 8) | 0;
      }
      r9 = r12;
      r10 = r12 - r11 | 0;
      r11 = (r2 - 4 | 0) >> 2;
      r13 = HEAP32[r11];
      r14 = (r13 & -8) - r10 | 0;
      if ((r13 & 3 | 0) == 0) {
        HEAP32[r12 >> 2] = HEAP32[r3 >> 2] + r10 | 0;
        HEAP32[r12 + 4 >> 2] = r14;
        r8 = r9;
        break;
      } else {
        r13 = r12 + 4 | 0;
        HEAP32[r13 >> 2] = r14 | HEAP32[r13 >> 2] & 1 | 2;
        r13 = r14 + (r12 + 4) | 0;
        HEAP32[r13 >> 2] = HEAP32[r13 >> 2] | 1;
        HEAP32[r11] = r10 | HEAP32[r11] & 1 | 2;
        r11 = r2 + (r10 - 4) | 0;
        HEAP32[r11 >> 2] = HEAP32[r11 >> 2] | 1;
        _dispose_chunk(r1, r10);
        r8 = r9;
        break;
      }
    }
  } while (0);
  r1 = r8 + 4 | 0;
  r2 = HEAP32[r1 >> 2];
  do {
    if ((r2 & 3 | 0) != 0) {
      r12 = r2 & -8;
      if (r12 >>> 0 <= (r6 + 16 | 0) >>> 0) {
        break;
      }
      r3 = r12 - r6 | 0;
      r4 = r8;
      HEAP32[r1 >> 2] = r6 | r2 & 1 | 2;
      HEAP32[r4 + (r6 | 4) >> 2] = r3 | 3;
      r7 = r4 + (r12 | 4) | 0;
      HEAP32[r7 >> 2] = HEAP32[r7 >> 2] | 1;
      _dispose_chunk(r4 + r6 | 0, r3);
    }
  } while (0);
  r5 = r8 + 8 | 0;
  return r5;
}
function _posix_memalign(r1, r2, r3) {
  var r4, r5, r6;
  do {
    if ((r2 | 0) == 8) {
      r4 = _malloc(r3);
    } else {
      r5 = r2 >>> 2;
      if ((r2 & 3 | 0) != 0 | (r5 | 0) == 0) {
        r6 = 22;
        return r6;
      }
      if ((r5 + 1073741823 & r5 | 0) != 0) {
        r6 = 22;
        return r6;
      }
      if ((-64 - r2 | 0) >>> 0 < r3 >>> 0) {
        r6 = 12;
        return r6;
      } else {
        r4 = _internal_memalign(r2 >>> 0 < 16 ? 16 : r2, r3);
        break;
      }
    }
  } while (0);
  if ((r4 | 0) == 0) {
    r6 = 12;
    return r6;
  }
  HEAP32[r1 >> 2] = r4;
  r6 = 0;
  return r6;
}
function _valloc(r1) {
  if ((HEAP32[102455] | 0) == 0) {
    _init_mparams();
  }
  return _memalign(HEAP32[102456], r1);
}
function _try_realloc_chunk(r1, r2) {
  var r3, r4, r5, r6, r7, r8, r9, r10, r11, r12, r13, r14, r15, r16, r17, r18, r19, r20, r21, r22, r23, r24, r25, r26, r27, r28, r29;
  r3 = (r1 + 4 | 0) >> 2;
  r4 = HEAP32[r3];
  r5 = r4 & -8, r6 = r5 >> 2;
  r7 = r1, r8 = r7 >> 2;
  r9 = r7 + r5 | 0;
  r10 = r9;
  r11 = HEAP32[102858];
  if (r7 >>> 0 < r11 >>> 0) {
    _abort();
  }
  r12 = r4 & 3;
  if (!((r12 | 0) != 1 & r7 >>> 0 < r9 >>> 0)) {
    _abort();
  }
  r13 = (r7 + (r5 | 4) | 0) >> 2;
  r14 = HEAP32[r13];
  if ((r14 & 1 | 0) == 0) {
    _abort();
  }
  if ((r12 | 0) == 0) {
    r15 = _mmap_resize(r1, r2);
    return r15;
  }
  if (r5 >>> 0 >= r2 >>> 0) {
    r12 = r5 - r2 | 0;
    if (r12 >>> 0 <= 15) {
      r15 = r1;
      return r15;
    }
    HEAP32[r3] = r4 & 1 | r2 | 2;
    HEAP32[(r2 + 4 >> 2) + r8] = r12 | 3;
    HEAP32[r13] = HEAP32[r13] | 1;
    _dispose_chunk(r7 + r2 | 0, r12);
    r15 = r1;
    return r15;
  }
  if ((r10 | 0) == (HEAP32[102860] | 0)) {
    r12 = HEAP32[102857] + r5 | 0;
    if (r12 >>> 0 <= r2 >>> 0) {
      r15 = 0;
      return r15;
    }
    r13 = r12 - r2 | 0;
    HEAP32[r3] = r4 & 1 | r2 | 2;
    HEAP32[(r2 + 4 >> 2) + r8] = r13 | 1;
    HEAP32[102860] = r7 + r2 | 0;
    HEAP32[102857] = r13;
    r15 = r1;
    return r15;
  }
  if ((r10 | 0) == (HEAP32[102859] | 0)) {
    r13 = HEAP32[102856] + r5 | 0;
    if (r13 >>> 0 < r2 >>> 0) {
      r15 = 0;
      return r15;
    }
    r12 = r13 - r2 | 0;
    if (r12 >>> 0 > 15) {
      HEAP32[r3] = r4 & 1 | r2 | 2;
      HEAP32[(r2 + 4 >> 2) + r8] = r12 | 1;
      HEAP32[(r13 >> 2) + r8] = r12;
      r16 = r13 + (r7 + 4) | 0;
      HEAP32[r16 >> 2] = HEAP32[r16 >> 2] & -2;
      r17 = r7 + r2 | 0;
      r18 = r12;
    } else {
      HEAP32[r3] = r4 & 1 | r13 | 2;
      r4 = r13 + (r7 + 4) | 0;
      HEAP32[r4 >> 2] = HEAP32[r4 >> 2] | 1;
      r17 = 0;
      r18 = 0;
    }
    HEAP32[102856] = r18;
    HEAP32[102859] = r17;
    r15 = r1;
    return r15;
  }
  if ((r14 & 2 | 0) != 0) {
    r15 = 0;
    return r15;
  }
  r17 = (r14 & -8) + r5 | 0;
  if (r17 >>> 0 < r2 >>> 0) {
    r15 = 0;
    return r15;
  }
  r18 = r17 - r2 | 0;
  r4 = r14 >>> 3;
  L2523 : do {
    if (r14 >>> 0 < 256) {
      r13 = HEAP32[r6 + (r8 + 2)];
      r12 = HEAP32[r6 + (r8 + 3)];
      r16 = (r4 << 3) + 411456 | 0;
      do {
        if ((r13 | 0) != (r16 | 0)) {
          if (r13 >>> 0 < r11 >>> 0) {
            _abort();
          }
          if ((HEAP32[r13 + 12 >> 2] | 0) == (r10 | 0)) {
            break;
          }
          _abort();
        }
      } while (0);
      if ((r12 | 0) == (r13 | 0)) {
        HEAP32[102854] = HEAP32[102854] & (1 << r4 ^ -1);
        break;
      }
      do {
        if ((r12 | 0) != (r16 | 0)) {
          if (r12 >>> 0 < HEAP32[102858] >>> 0) {
            _abort();
          }
          if ((HEAP32[r12 + 8 >> 2] | 0) == (r10 | 0)) {
            break;
          }
          _abort();
        }
      } while (0);
      HEAP32[r13 + 12 >> 2] = r12;
      HEAP32[r12 + 8 >> 2] = r13;
    } else {
      r16 = r9;
      r19 = HEAP32[r6 + (r8 + 6)];
      r20 = HEAP32[r6 + (r8 + 3)];
      L2543 : do {
        if ((r20 | 0) == (r16 | 0)) {
          r21 = r5 + (r7 + 20) | 0;
          r22 = HEAP32[r21 >> 2];
          do {
            if ((r22 | 0) == 0) {
              r23 = r5 + (r7 + 16) | 0;
              r24 = HEAP32[r23 >> 2];
              if ((r24 | 0) == 0) {
                r25 = 0, r26 = r25 >> 2;
                break L2543;
              } else {
                r27 = r24;
                r28 = r23;
                break;
              }
            } else {
              r27 = r22;
              r28 = r21;
            }
          } while (0);
          while (1) {
            r21 = r27 + 20 | 0;
            if ((HEAP32[r21 >> 2] | 0) == 0) {
              r22 = r27 + 16 | 0;
              if ((HEAP32[r22 >> 2] | 0) == 0) {
                break;
              } else {
                r29 = r22;
              }
            } else {
              r29 = r21;
            }
            r27 = HEAP32[r29 >> 2];
            r28 = r29;
          }
          if (r28 >>> 0 < HEAP32[102858] >>> 0) {
            _abort();
          } else {
            HEAP32[r28 >> 2] = 0;
            r25 = r27, r26 = r25 >> 2;
            break;
          }
        } else {
          r21 = HEAP32[r6 + (r8 + 2)];
          if (r21 >>> 0 < r11 >>> 0) {
            _abort();
          }
          r22 = r21 + 12 | 0;
          if ((HEAP32[r22 >> 2] | 0) != (r16 | 0)) {
            _abort();
          }
          r23 = r20 + 8 | 0;
          if ((HEAP32[r23 >> 2] | 0) == (r16 | 0)) {
            HEAP32[r22 >> 2] = r20;
            HEAP32[r23 >> 2] = r21;
            r25 = r20, r26 = r25 >> 2;
            break;
          } else {
            _abort();
          }
        }
      } while (0);
      if ((r19 | 0) == 0) {
        break;
      }
      r20 = r5 + (r7 + 28) | 0;
      r13 = (HEAP32[r20 >> 2] << 2) + 411720 | 0;
      do {
        if ((r16 | 0) == (HEAP32[r13 >> 2] | 0)) {
          HEAP32[r13 >> 2] = r25;
          if ((r25 | 0) != 0) {
            break;
          }
          HEAP32[102855] = HEAP32[102855] & (1 << HEAP32[r20 >> 2] ^ -1);
          break L2523;
        } else {
          if (r19 >>> 0 < HEAP32[102858] >>> 0) {
            _abort();
          }
          r12 = r19 + 16 | 0;
          if ((HEAP32[r12 >> 2] | 0) == (r16 | 0)) {
            HEAP32[r12 >> 2] = r25;
          } else {
            HEAP32[r19 + 20 >> 2] = r25;
          }
          if ((r25 | 0) == 0) {
            break L2523;
          }
        }
      } while (0);
      if (r25 >>> 0 < HEAP32[102858] >>> 0) {
        _abort();
      }
      HEAP32[r26 + 6] = r19;
      r16 = HEAP32[r6 + (r8 + 4)];
      do {
        if ((r16 | 0) != 0) {
          if (r16 >>> 0 < HEAP32[102858] >>> 0) {
            _abort();
          } else {
            HEAP32[r26 + 4] = r16;
            HEAP32[r16 + 24 >> 2] = r25;
            break;
          }
        }
      } while (0);
      r16 = HEAP32[r6 + (r8 + 5)];
      if ((r16 | 0) == 0) {
        break;
      }
      if (r16 >>> 0 < HEAP32[102858] >>> 0) {
        _abort();
      } else {
        HEAP32[r26 + 5] = r16;
        HEAP32[r16 + 24 >> 2] = r25;
        break;
      }
    }
  } while (0);
  if (r18 >>> 0 < 16) {
    HEAP32[r3] = r17 | HEAP32[r3] & 1 | 2;
    r25 = r7 + (r17 | 4) | 0;
    HEAP32[r25 >> 2] = HEAP32[r25 >> 2] | 1;
    r15 = r1;
    return r15;
  } else {
    HEAP32[r3] = HEAP32[r3] & 1 | r2 | 2;
    HEAP32[(r2 + 4 >> 2) + r8] = r18 | 3;
    r8 = r7 + (r17 | 4) | 0;
    HEAP32[r8 >> 2] = HEAP32[r8 >> 2] | 1;
    _dispose_chunk(r7 + r2 | 0, r18);
    r15 = r1;
    return r15;
  }
}
function _malloc_footprint() {
  return HEAP32[102962];
}
function _malloc_max_footprint() {
  return HEAP32[102963];
}
function _malloc_footprint_limit() {
  var r1;
  r1 = HEAP32[102964];
  return (r1 | 0) == 0 ? -1 : r1;
}
function _malloc_set_footprint_limit(r1) {
  var r2, r3;
  if ((r1 | 0) == -1) {
    r2 = 0;
  } else {
    r3 = HEAP32[102457];
    r2 = r1 - 1 + r3 & -r3;
  }
  HEAP32[102964] = r2;
  return r2;
}
function _malloc_usable_size(r1) {
  var r2, r3;
  if ((r1 | 0) == 0) {
    r2 = 0;
    return r2;
  }
  r3 = HEAP32[r1 - 4 >> 2];
  r1 = r3 & 3;
  if ((r1 | 0) == 1) {
    r2 = 0;
    return r2;
  }
  r2 = (r3 & -8) - ((r1 | 0) == 0 ? 8 : 4) | 0;
  return r2;
}
function _pvalloc(r1) {
  var r2;
  if ((HEAP32[102455] | 0) == 0) {
    _init_mparams();
  }
  r2 = HEAP32[102456];
  return _memalign(r2, r1 - 1 + r2 & -r2);
}
function _independent_calloc(r1, r2, r3) {
  var r4, r5;
  r4 = STACKTOP;
  STACKTOP = STACKTOP + 4 | 0;
  r5 = r4;
  HEAP32[r5 >> 2] = r2;
  r2 = _ialloc(r1, r5, 3, r3);
  STACKTOP = r4;
  return r2;
}
function _ialloc(r1, r2, r3, r4) {
  var r5, r6, r7, r8, r9, r10, r11, r12, r13, r14, r15, r16, r17, r18, r19, r20;
  if ((HEAP32[102455] | 0) == 0) {
    _init_mparams();
  }
  r5 = (r1 | 0) == 0;
  do {
    if ((r4 | 0) == 0) {
      if (r5) {
        r6 = _malloc(0);
        return r6;
      } else {
        r7 = r1 << 2;
        if (r7 >>> 0 < 11) {
          r8 = 0;
          r9 = 16;
          break;
        }
        r8 = 0;
        r9 = r7 + 11 & -8;
        break;
      }
    } else {
      if (r5) {
        r6 = r4;
      } else {
        r8 = r4;
        r9 = 0;
        break;
      }
      return r6;
    }
  } while (0);
  L2633 : do {
    if ((r3 & 1 | 0) == 0) {
      if ((r1 | 0) == 0) {
        r10 = 0;
        r11 = 0;
        break;
      } else {
        r12 = 0;
        r13 = 0;
      }
      while (1) {
        r4 = HEAP32[r2 + (r13 << 2) >> 2];
        if (r4 >>> 0 < 11) {
          r14 = 16;
        } else {
          r14 = r4 + 11 & -8;
        }
        r4 = r14 + r12 | 0;
        r5 = r13 + 1 | 0;
        if ((r5 | 0) == (r1 | 0)) {
          r10 = 0;
          r11 = r4;
          break L2633;
        } else {
          r12 = r4;
          r13 = r5;
        }
      }
    } else {
      r5 = HEAP32[r2 >> 2];
      if (r5 >>> 0 < 11) {
        r15 = 16;
      } else {
        r15 = r5 + 11 & -8;
      }
      r10 = r15;
      r11 = Math.imul(r15, r1);
    }
  } while (0);
  r15 = _malloc(r9 - 4 + r11 | 0);
  if ((r15 | 0) == 0) {
    r6 = 0;
    return r6;
  }
  r13 = r15 - 8 | 0;
  r12 = HEAP32[r15 - 4 >> 2] & -8;
  if ((r3 & 2 | 0) != 0) {
    _memset(r15, 0, -4 - r9 + r12 | 0);
  }
  if ((r8 | 0) == 0) {
    HEAP32[r15 + (r11 - 4) >> 2] = r12 - r11 | 3;
    r16 = r15 + r11 | 0;
    r17 = r11;
  } else {
    r16 = r8;
    r17 = r12;
  }
  HEAP32[r16 >> 2] = r15;
  r15 = r1 - 1 | 0;
  L2654 : do {
    if ((r15 | 0) == 0) {
      r18 = r13;
      r19 = r17;
    } else {
      r1 = (r10 | 0) == 0;
      r12 = r13;
      r8 = r17;
      r11 = 0;
      while (1) {
        do {
          if (r1) {
            r9 = HEAP32[r2 + (r11 << 2) >> 2];
            if (r9 >>> 0 < 11) {
              r20 = 16;
              break;
            }
            r20 = r9 + 11 & -8;
          } else {
            r20 = r10;
          }
        } while (0);
        r9 = r8 - r20 | 0;
        HEAP32[r12 + 4 >> 2] = r20 | 3;
        r3 = r12 + r20 | 0;
        r14 = r11 + 1 | 0;
        HEAP32[r16 + (r14 << 2) >> 2] = r20 + (r12 + 8) | 0;
        if ((r14 | 0) == (r15 | 0)) {
          r18 = r3;
          r19 = r9;
          break L2654;
        } else {
          r12 = r3;
          r8 = r9;
          r11 = r14;
        }
      }
    }
  } while (0);
  HEAP32[r18 + 4 >> 2] = r19 | 3;
  r6 = r16;
  return r6;
}
function _independent_comalloc(r1, r2, r3) {
  return _ialloc(r1, r2, 0, r3);
}
function _bulk_free(r1, r2) {
  _internal_bulk_free(r1, r2);
  return 0;
}
function _malloc_trim(r1) {
  if ((HEAP32[102455] | 0) == 0) {
    _init_mparams();
  }
  return _sys_trim(r1);
}
function _mallinfo(r1) {
  _internal_mallinfo(r1);
  return;
}
function _internal_mallinfo(r1) {
  var r2, r3, r4, r5, r6, r7, r8, r9, r10, r11, r12, r13, r14, r15, r16, r17, r18, r19, r20, r21, r22, r23, r24, r25, r26, r27, r28, r29, r30, r31, r32, r33;
  r2 = r1 >> 2;
  if ((HEAP32[102455] | 0) == 0) {
    _init_mparams();
  }
  if ((HEAP32[102860] | 0) == 0) {
    r3 = 0;
    r4 = 0;
    r5 = 0;
    r6 = 0;
    r7 = 0;
    r8 = 0;
    r9 = 0;
  } else {
    r10 = HEAP32[102857] + 40 | 0;
    r11 = HEAP32[102860];
    r12 = 1;
    r13 = r10;
    r14 = r10;
    r10 = 411864;
    while (1) {
      r15 = (r10 | 0) >> 2;
      r16 = HEAP32[r15];
      r17 = r16 + 8 | 0;
      if ((r17 & 7 | 0) == 0) {
        r18 = 0;
      } else {
        r18 = -r17 & 7;
      }
      r17 = r16 + r18 | 0;
      r16 = HEAP32[r15];
      L2682 : do {
        if (r17 >>> 0 < r16 >>> 0) {
          r19 = r12;
          r20 = r13;
          r21 = r14;
        } else {
          r22 = HEAP32[r10 + 4 >> 2];
          r23 = r12;
          r24 = r13;
          r25 = r14;
          r26 = r17;
          r27 = r16;
          while (1) {
            if (r26 >>> 0 >= (r27 + r22 | 0) >>> 0 | (r26 | 0) == (r11 | 0)) {
              r19 = r23;
              r20 = r24;
              r21 = r25;
              break L2682;
            }
            r28 = r26 + 4 | 0;
            r29 = HEAP32[r28 >> 2];
            if ((r29 | 0) == 7) {
              r19 = r23;
              r20 = r24;
              r21 = r25;
              break L2682;
            }
            r30 = r29 & -8;
            r31 = r30 + r25 | 0;
            if ((r29 & 3 | 0) == 1) {
              r32 = r30 + r24 | 0;
              r33 = r23 + 1 | 0;
            } else {
              r32 = r24;
              r33 = r23;
            }
            r30 = r26 + (HEAP32[r28 >> 2] & -8) | 0;
            r28 = HEAP32[r15];
            if (r30 >>> 0 < r28 >>> 0) {
              r19 = r33;
              r20 = r32;
              r21 = r31;
              break L2682;
            } else {
              r23 = r33;
              r24 = r32;
              r25 = r31;
              r26 = r30;
              r27 = r28;
            }
          }
        }
      } while (0);
      r15 = HEAP32[r10 + 8 >> 2];
      if ((r15 | 0) == 0) {
        break;
      } else {
        r12 = r19;
        r13 = r20;
        r14 = r21;
        r10 = r15;
      }
    }
    r10 = HEAP32[102962];
    r3 = HEAP32[102857];
    r4 = r21;
    r5 = r19;
    r6 = r10 - r21 | 0;
    r7 = HEAP32[102963];
    r8 = r20;
    r9 = r10 - r20 | 0;
  }
  HEAP32[r2] = r4;
  HEAP32[r2 + 1] = r5;
  r5 = r1 + 8 | 0;
  HEAP32[r5 >> 2] = 0;
  HEAP32[r5 + 4 >> 2] = 0;
  HEAP32[r2 + 4] = r6;
  HEAP32[r2 + 5] = r7;
  HEAP32[r2 + 6] = 0;
  HEAP32[r2 + 7] = r9;
  HEAP32[r2 + 8] = r8;
  HEAP32[r2 + 9] = r3;
  return;
}
function _malloc_stats() {
  _internal_malloc_stats();
  return;
}
function _internal_malloc_stats() {
  var r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11, r12, r13, r14, r15, r16, r17, r18, r19, r20, r21;
  r1 = STACKTOP;
  if ((HEAP32[102455] | 0) == 0) {
    _init_mparams();
  }
  L2699 : do {
    if ((HEAP32[102860] | 0) == 0) {
      r2 = 0;
      r3 = 0;
      r4 = 0;
    } else {
      r5 = HEAP32[102963];
      r6 = HEAP32[102962];
      r7 = HEAP32[102860];
      r8 = r6 - 40 - HEAP32[102857] | 0;
      r9 = 411864;
      while (1) {
        r10 = (r9 | 0) >> 2;
        r11 = HEAP32[r10];
        r12 = r11 + 8 | 0;
        if ((r12 & 7 | 0) == 0) {
          r13 = 0;
        } else {
          r13 = -r12 & 7;
        }
        r12 = r11 + r13 | 0;
        r11 = HEAP32[r10];
        L2706 : do {
          if (r12 >>> 0 < r11 >>> 0) {
            r14 = r8;
          } else {
            r15 = HEAP32[r9 + 4 >> 2];
            r16 = r8;
            r17 = r12;
            r18 = r11;
            while (1) {
              if (r17 >>> 0 >= (r18 + r15 | 0) >>> 0 | (r17 | 0) == (r7 | 0)) {
                r14 = r16;
                break L2706;
              }
              r19 = r17 + 4 | 0;
              r20 = HEAP32[r19 >> 2];
              if ((r20 | 0) == 7) {
                r14 = r16;
                break L2706;
              }
              if ((r20 & 3 | 0) == 1) {
                r21 = r16 - (r20 & -8) | 0;
              } else {
                r21 = r16;
              }
              r20 = r17 + (HEAP32[r19 >> 2] & -8) | 0;
              r19 = HEAP32[r10];
              if (r20 >>> 0 < r19 >>> 0) {
                r14 = r21;
                break L2706;
              } else {
                r16 = r21;
                r17 = r20;
                r18 = r19;
              }
            }
          }
        } while (0);
        r10 = HEAP32[r9 + 8 >> 2];
        if ((r10 | 0) == 0) {
          r2 = r14;
          r3 = r6;
          r4 = r5;
          break L2699;
        } else {
          r8 = r14;
          r9 = r10;
        }
      }
    }
  } while (0);
  _fprintf(HEAP32[_stderr >> 2], 411136, (tempInt = STACKTOP, STACKTOP = STACKTOP + 4 | 0, HEAP32[tempInt >> 2] = r4, tempInt));
  _fprintf(HEAP32[_stderr >> 2], 411280, (tempInt = STACKTOP, STACKTOP = STACKTOP + 4 | 0, HEAP32[tempInt >> 2] = r3, tempInt));
  _fprintf(HEAP32[_stderr >> 2], 411180, (tempInt = STACKTOP, STACKTOP = STACKTOP + 4 | 0, HEAP32[tempInt >> 2] = r2, tempInt));
  STACKTOP = r1;
  return;
}
function _mallopt(r1, r2) {
  return _change_mparam(r1, r2);
}
function _change_mparam(r1, r2) {
  var r3;
  if ((HEAP32[102455] | 0) == 0) {
    _init_mparams();
  }
  do {
    if ((r1 | 0) == -3) {
      HEAP32[102458] = r2;
      r3 = 1;
    } else if ((r1 | 0) == -2) {
      if (HEAP32[102456] >>> 0 > r2 >>> 0) {
        r3 = 0;
        break;
      }
      if ((r2 - 1 & r2 | 0) != 0) {
        r3 = 0;
        break;
      }
      HEAP32[102457] = r2;
      r3 = 1;
    } else if ((r1 | 0) == -1) {
      HEAP32[102459] = r2;
      r3 = 1;
    } else {
      r3 = 0;
    }
  } while (0);
  return r3;
}
function _init_mparams() {
  var r1;
  if ((HEAP32[102455] | 0) != 0) {
    return;
  }
  r1 = _sysconf(8);
  if ((r1 - 1 & r1 | 0) != 0) {
    _abort();
  }
  HEAP32[102457] = r1;
  HEAP32[102456] = r1;
  HEAP32[102458] = -1;
  HEAP32[102459] = 2097152;
  HEAP32[102460] = 0;
  HEAP32[102965] = 0;
  HEAP32[102455] = _time(0) & -16 ^ 1431655768;
  return;
}
function _internal_bulk_free(r1, r2) {
  var r3, r4, r5, r6, r7, r8, r9, r10, r11, r12, r13, r14;
  r3 = 0;
  r4 = (r2 << 2) + r1 | 0;
  L2738 : do {
    if ((r2 | 0) != 0) {
      r5 = r1;
      L2739 : while (1) {
        r6 = HEAP32[r5 >> 2];
        L2741 : do {
          if ((r6 | 0) != 0) {
            r7 = r6 - 8 | 0;
            r8 = r7;
            r9 = (r6 - 4 | 0) >> 2;
            r10 = HEAP32[r9] & -8;
            HEAP32[r5 >> 2] = 0;
            if (r7 >>> 0 < HEAP32[102858] >>> 0) {
              r3 = 2112;
              break L2739;
            }
            r7 = HEAP32[r9];
            if ((r7 & 3 | 0) == 1) {
              r3 = 2111;
              break L2739;
            }
            r11 = r5 + 4 | 0;
            r12 = r7 - 8 & -8;
            do {
              if ((r11 | 0) != (r4 | 0)) {
                if ((HEAP32[r11 >> 2] | 0) != (r12 + (r6 + 8) | 0)) {
                  break;
                }
                r13 = (HEAP32[r6 + (r12 | 4) >> 2] & -8) + r10 | 0;
                HEAP32[r9] = r7 & 1 | r13 | 2;
                r14 = r6 + (r13 - 4) | 0;
                HEAP32[r14 >> 2] = HEAP32[r14 >> 2] | 1;
                HEAP32[r11 >> 2] = r6;
                break L2741;
              }
            } while (0);
            _dispose_chunk(r8, r10);
          }
        } while (0);
        r6 = r5 + 4 | 0;
        if ((r6 | 0) == (r4 | 0)) {
          break L2738;
        } else {
          r5 = r6;
        }
      }
      if (r3 == 2111) {
        _abort();
      } else if (r3 == 2112) {
        _abort();
      }
    }
  } while (0);
  if (HEAP32[102857] >>> 0 <= HEAP32[102861] >>> 0) {
    return;
  }
  _sys_trim(0);
  return;
}
function _mmap_resize(r1, r2) {
  var r3, r4;
  r3 = HEAP32[r1 + 4 >> 2] & -8;
  if (r2 >>> 0 < 256) {
    r4 = 0;
    return r4;
  }
  do {
    if (r3 >>> 0 >= (r2 + 4 | 0) >>> 0) {
      if ((r3 - r2 | 0) >>> 0 > HEAP32[102457] << 1 >>> 0) {
        break;
      } else {
        r4 = r1;
      }
      return r4;
    }
  } while (0);
  r4 = 0;
  return r4;
}
function _segment_holding(r1) {
  var r2, r3, r4, r5, r6;
  r2 = 0;
  r3 = 411864, r4 = r3 >> 2;
  while (1) {
    r5 = HEAP32[r4];
    if (r5 >>> 0 <= r1 >>> 0) {
      if ((r5 + HEAP32[r4 + 1] | 0) >>> 0 > r1 >>> 0) {
        r6 = r3;
        r2 = 2126;
        break;
      }
    }
    r5 = HEAP32[r4 + 2];
    if ((r5 | 0) == 0) {
      r6 = 0;
      r2 = 2127;
      break;
    } else {
      r3 = r5, r4 = r3 >> 2;
    }
  }
  if (r2 == 2127) {
    return r6;
  } else if (r2 == 2126) {
    return r6;
  }
}
function _dispose_chunk(r1, r2) {
  var r3, r4, r5, r6, r7, r8, r9, r10, r11, r12, r13, r14, r15, r16, r17, r18, r19, r20, r21, r22, r23, r24, r25, r26, r27, r28, r29, r30, r31, r32, r33, r34, r35, r36, r37, r38, r39, r40, r41, r42;
  r3 = r2 >> 2;
  r4 = 0;
  r5 = r1, r6 = r5 >> 2;
  r7 = r5 + r2 | 0;
  r8 = r7;
  r9 = HEAP32[r1 + 4 >> 2];
  L2777 : do {
    if ((r9 & 1 | 0) == 0) {
      r10 = HEAP32[r1 >> 2];
      if ((r9 & 3 | 0) == 0) {
        return;
      }
      r11 = r5 + -r10 | 0;
      r12 = r11;
      r13 = r10 + r2 | 0;
      r14 = HEAP32[102858];
      if (r11 >>> 0 < r14 >>> 0) {
        _abort();
      }
      if ((r12 | 0) == (HEAP32[102859] | 0)) {
        r15 = (r2 + (r5 + 4) | 0) >> 2;
        if ((HEAP32[r15] & 3 | 0) != 3) {
          r16 = r12, r17 = r16 >> 2;
          r18 = r13;
          break;
        }
        HEAP32[102856] = r13;
        HEAP32[r15] = HEAP32[r15] & -2;
        HEAP32[(4 - r10 >> 2) + r6] = r13 | 1;
        HEAP32[r7 >> 2] = r13;
        return;
      }
      r15 = r10 >>> 3;
      if (r10 >>> 0 < 256) {
        r19 = HEAP32[(8 - r10 >> 2) + r6];
        r20 = HEAP32[(12 - r10 >> 2) + r6];
        r21 = (r15 << 3) + 411456 | 0;
        do {
          if ((r19 | 0) != (r21 | 0)) {
            if (r19 >>> 0 < r14 >>> 0) {
              _abort();
            }
            if ((HEAP32[r19 + 12 >> 2] | 0) == (r12 | 0)) {
              break;
            }
            _abort();
          }
        } while (0);
        if ((r20 | 0) == (r19 | 0)) {
          HEAP32[102854] = HEAP32[102854] & (1 << r15 ^ -1);
          r16 = r12, r17 = r16 >> 2;
          r18 = r13;
          break;
        }
        do {
          if ((r20 | 0) != (r21 | 0)) {
            if (r20 >>> 0 < HEAP32[102858] >>> 0) {
              _abort();
            }
            if ((HEAP32[r20 + 8 >> 2] | 0) == (r12 | 0)) {
              break;
            }
            _abort();
          }
        } while (0);
        HEAP32[r19 + 12 >> 2] = r20;
        HEAP32[r20 + 8 >> 2] = r19;
        r16 = r12, r17 = r16 >> 2;
        r18 = r13;
        break;
      }
      r21 = r11;
      r15 = HEAP32[(24 - r10 >> 2) + r6];
      r22 = HEAP32[(12 - r10 >> 2) + r6];
      L2810 : do {
        if ((r22 | 0) == (r21 | 0)) {
          r23 = 16 - r10 | 0;
          r24 = r23 + (r5 + 4) | 0;
          r25 = HEAP32[r24 >> 2];
          do {
            if ((r25 | 0) == 0) {
              r26 = r5 + r23 | 0;
              r27 = HEAP32[r26 >> 2];
              if ((r27 | 0) == 0) {
                r28 = 0, r29 = r28 >> 2;
                break L2810;
              } else {
                r30 = r27;
                r31 = r26;
                break;
              }
            } else {
              r30 = r25;
              r31 = r24;
            }
          } while (0);
          while (1) {
            r24 = r30 + 20 | 0;
            if ((HEAP32[r24 >> 2] | 0) == 0) {
              r25 = r30 + 16 | 0;
              if ((HEAP32[r25 >> 2] | 0) == 0) {
                break;
              } else {
                r32 = r25;
              }
            } else {
              r32 = r24;
            }
            r30 = HEAP32[r32 >> 2];
            r31 = r32;
          }
          if (r31 >>> 0 < HEAP32[102858] >>> 0) {
            _abort();
          } else {
            HEAP32[r31 >> 2] = 0;
            r28 = r30, r29 = r28 >> 2;
            break;
          }
        } else {
          r24 = HEAP32[(8 - r10 >> 2) + r6];
          if (r24 >>> 0 < r14 >>> 0) {
            _abort();
          }
          r25 = r24 + 12 | 0;
          if ((HEAP32[r25 >> 2] | 0) != (r21 | 0)) {
            _abort();
          }
          r23 = r22 + 8 | 0;
          if ((HEAP32[r23 >> 2] | 0) == (r21 | 0)) {
            HEAP32[r25 >> 2] = r22;
            HEAP32[r23 >> 2] = r24;
            r28 = r22, r29 = r28 >> 2;
            break;
          } else {
            _abort();
          }
        }
      } while (0);
      if ((r15 | 0) == 0) {
        r16 = r12, r17 = r16 >> 2;
        r18 = r13;
        break;
      }
      r22 = r5 + (28 - r10) | 0;
      r14 = (HEAP32[r22 >> 2] << 2) + 411720 | 0;
      do {
        if ((r21 | 0) == (HEAP32[r14 >> 2] | 0)) {
          HEAP32[r14 >> 2] = r28;
          if ((r28 | 0) != 0) {
            break;
          }
          HEAP32[102855] = HEAP32[102855] & (1 << HEAP32[r22 >> 2] ^ -1);
          r16 = r12, r17 = r16 >> 2;
          r18 = r13;
          break L2777;
        } else {
          if (r15 >>> 0 < HEAP32[102858] >>> 0) {
            _abort();
          }
          r11 = r15 + 16 | 0;
          if ((HEAP32[r11 >> 2] | 0) == (r21 | 0)) {
            HEAP32[r11 >> 2] = r28;
          } else {
            HEAP32[r15 + 20 >> 2] = r28;
          }
          if ((r28 | 0) == 0) {
            r16 = r12, r17 = r16 >> 2;
            r18 = r13;
            break L2777;
          }
        }
      } while (0);
      if (r28 >>> 0 < HEAP32[102858] >>> 0) {
        _abort();
      }
      HEAP32[r29 + 6] = r15;
      r21 = 16 - r10 | 0;
      r22 = HEAP32[(r21 >> 2) + r6];
      do {
        if ((r22 | 0) != 0) {
          if (r22 >>> 0 < HEAP32[102858] >>> 0) {
            _abort();
          } else {
            HEAP32[r29 + 4] = r22;
            HEAP32[r22 + 24 >> 2] = r28;
            break;
          }
        }
      } while (0);
      r22 = HEAP32[(r21 + 4 >> 2) + r6];
      if ((r22 | 0) == 0) {
        r16 = r12, r17 = r16 >> 2;
        r18 = r13;
        break;
      }
      if (r22 >>> 0 < HEAP32[102858] >>> 0) {
        _abort();
      } else {
        HEAP32[r29 + 5] = r22;
        HEAP32[r22 + 24 >> 2] = r28;
        r16 = r12, r17 = r16 >> 2;
        r18 = r13;
        break;
      }
    } else {
      r16 = r1, r17 = r16 >> 2;
      r18 = r2;
    }
  } while (0);
  r1 = HEAP32[102858];
  if (r7 >>> 0 < r1 >>> 0) {
    _abort();
  }
  r28 = r2 + (r5 + 4) | 0;
  r29 = HEAP32[r28 >> 2];
  do {
    if ((r29 & 2 | 0) == 0) {
      if ((r8 | 0) == (HEAP32[102860] | 0)) {
        r30 = HEAP32[102857] + r18 | 0;
        HEAP32[102857] = r30;
        HEAP32[102860] = r16;
        HEAP32[r17 + 1] = r30 | 1;
        if ((r16 | 0) != (HEAP32[102859] | 0)) {
          return;
        }
        HEAP32[102859] = 0;
        HEAP32[102856] = 0;
        return;
      }
      if ((r8 | 0) == (HEAP32[102859] | 0)) {
        r30 = HEAP32[102856] + r18 | 0;
        HEAP32[102856] = r30;
        HEAP32[102859] = r16;
        HEAP32[r17 + 1] = r30 | 1;
        HEAP32[(r30 >> 2) + r17] = r30;
        return;
      }
      r30 = (r29 & -8) + r18 | 0;
      r31 = r29 >>> 3;
      L2877 : do {
        if (r29 >>> 0 < 256) {
          r32 = HEAP32[r3 + (r6 + 2)];
          r9 = HEAP32[r3 + (r6 + 3)];
          r22 = (r31 << 3) + 411456 | 0;
          do {
            if ((r32 | 0) != (r22 | 0)) {
              if (r32 >>> 0 < r1 >>> 0) {
                _abort();
              }
              if ((HEAP32[r32 + 12 >> 2] | 0) == (r8 | 0)) {
                break;
              }
              _abort();
            }
          } while (0);
          if ((r9 | 0) == (r32 | 0)) {
            HEAP32[102854] = HEAP32[102854] & (1 << r31 ^ -1);
            break;
          }
          do {
            if ((r9 | 0) != (r22 | 0)) {
              if (r9 >>> 0 < HEAP32[102858] >>> 0) {
                _abort();
              }
              if ((HEAP32[r9 + 8 >> 2] | 0) == (r8 | 0)) {
                break;
              }
              _abort();
            }
          } while (0);
          HEAP32[r32 + 12 >> 2] = r9;
          HEAP32[r9 + 8 >> 2] = r32;
        } else {
          r22 = r7;
          r10 = HEAP32[r3 + (r6 + 6)];
          r15 = HEAP32[r3 + (r6 + 3)];
          L2897 : do {
            if ((r15 | 0) == (r22 | 0)) {
              r14 = r2 + (r5 + 20) | 0;
              r11 = HEAP32[r14 >> 2];
              do {
                if ((r11 | 0) == 0) {
                  r19 = r2 + (r5 + 16) | 0;
                  r20 = HEAP32[r19 >> 2];
                  if ((r20 | 0) == 0) {
                    r33 = 0, r34 = r33 >> 2;
                    break L2897;
                  } else {
                    r35 = r20;
                    r36 = r19;
                    break;
                  }
                } else {
                  r35 = r11;
                  r36 = r14;
                }
              } while (0);
              while (1) {
                r14 = r35 + 20 | 0;
                if ((HEAP32[r14 >> 2] | 0) == 0) {
                  r11 = r35 + 16 | 0;
                  if ((HEAP32[r11 >> 2] | 0) == 0) {
                    break;
                  } else {
                    r37 = r11;
                  }
                } else {
                  r37 = r14;
                }
                r35 = HEAP32[r37 >> 2];
                r36 = r37;
              }
              if (r36 >>> 0 < HEAP32[102858] >>> 0) {
                _abort();
              } else {
                HEAP32[r36 >> 2] = 0;
                r33 = r35, r34 = r33 >> 2;
                break;
              }
            } else {
              r14 = HEAP32[r3 + (r6 + 2)];
              if (r14 >>> 0 < r1 >>> 0) {
                _abort();
              }
              r11 = r14 + 12 | 0;
              if ((HEAP32[r11 >> 2] | 0) != (r22 | 0)) {
                _abort();
              }
              r19 = r15 + 8 | 0;
              if ((HEAP32[r19 >> 2] | 0) == (r22 | 0)) {
                HEAP32[r11 >> 2] = r15;
                HEAP32[r19 >> 2] = r14;
                r33 = r15, r34 = r33 >> 2;
                break;
              } else {
                _abort();
              }
            }
          } while (0);
          if ((r10 | 0) == 0) {
            break;
          }
          r15 = r2 + (r5 + 28) | 0;
          r32 = (HEAP32[r15 >> 2] << 2) + 411720 | 0;
          do {
            if ((r22 | 0) == (HEAP32[r32 >> 2] | 0)) {
              HEAP32[r32 >> 2] = r33;
              if ((r33 | 0) != 0) {
                break;
              }
              HEAP32[102855] = HEAP32[102855] & (1 << HEAP32[r15 >> 2] ^ -1);
              break L2877;
            } else {
              if (r10 >>> 0 < HEAP32[102858] >>> 0) {
                _abort();
              }
              r9 = r10 + 16 | 0;
              if ((HEAP32[r9 >> 2] | 0) == (r22 | 0)) {
                HEAP32[r9 >> 2] = r33;
              } else {
                HEAP32[r10 + 20 >> 2] = r33;
              }
              if ((r33 | 0) == 0) {
                break L2877;
              }
            }
          } while (0);
          if (r33 >>> 0 < HEAP32[102858] >>> 0) {
            _abort();
          }
          HEAP32[r34 + 6] = r10;
          r22 = HEAP32[r3 + (r6 + 4)];
          do {
            if ((r22 | 0) != 0) {
              if (r22 >>> 0 < HEAP32[102858] >>> 0) {
                _abort();
              } else {
                HEAP32[r34 + 4] = r22;
                HEAP32[r22 + 24 >> 2] = r33;
                break;
              }
            }
          } while (0);
          r22 = HEAP32[r3 + (r6 + 5)];
          if ((r22 | 0) == 0) {
            break;
          }
          if (r22 >>> 0 < HEAP32[102858] >>> 0) {
            _abort();
          } else {
            HEAP32[r34 + 5] = r22;
            HEAP32[r22 + 24 >> 2] = r33;
            break;
          }
        }
      } while (0);
      HEAP32[r17 + 1] = r30 | 1;
      HEAP32[(r30 >> 2) + r17] = r30;
      if ((r16 | 0) != (HEAP32[102859] | 0)) {
        r38 = r30;
        break;
      }
      HEAP32[102856] = r30;
      return;
    } else {
      HEAP32[r28 >> 2] = r29 & -2;
      HEAP32[r17 + 1] = r18 | 1;
      HEAP32[(r18 >> 2) + r17] = r18;
      r38 = r18;
    }
  } while (0);
  r18 = r38 >>> 3;
  if (r38 >>> 0 < 256) {
    r29 = r18 << 1;
    r28 = (r29 << 2) + 411456 | 0;
    r33 = HEAP32[102854];
    r34 = 1 << r18;
    do {
      if ((r33 & r34 | 0) == 0) {
        HEAP32[102854] = r33 | r34;
        r39 = r28;
      } else {
        r18 = HEAP32[(r29 + 2 << 2) + 411456 >> 2];
        if (r18 >>> 0 >= HEAP32[102858] >>> 0) {
          r39 = r18;
          break;
        }
        _abort();
      }
    } while (0);
    HEAP32[(r29 + 2 << 2) + 411456 >> 2] = r16;
    HEAP32[r39 + 12 >> 2] = r16;
    HEAP32[r17 + 2] = r39;
    HEAP32[r17 + 3] = r28;
    return;
  }
  r28 = r16;
  r39 = r38 >>> 8;
  do {
    if ((r39 | 0) == 0) {
      r40 = 0;
    } else {
      if (r38 >>> 0 > 16777215) {
        r40 = 31;
        break;
      }
      r29 = (r39 + 1048320 | 0) >>> 16 & 8;
      r34 = r39 << r29;
      r33 = (r34 + 520192 | 0) >>> 16 & 4;
      r18 = r34 << r33;
      r34 = (r18 + 245760 | 0) >>> 16 & 2;
      r6 = 14 - (r33 | r29 | r34) + (r18 << r34 >>> 15) | 0;
      r40 = r38 >>> ((r6 + 7 | 0) >>> 0) & 1 | r6 << 1;
    }
  } while (0);
  r39 = (r40 << 2) + 411720 | 0;
  HEAP32[r17 + 7] = r40;
  HEAP32[r17 + 5] = 0;
  HEAP32[r17 + 4] = 0;
  r6 = HEAP32[102855];
  r34 = 1 << r40;
  if ((r6 & r34 | 0) == 0) {
    HEAP32[102855] = r6 | r34;
    HEAP32[r39 >> 2] = r28;
    HEAP32[r17 + 6] = r39;
    HEAP32[r17 + 3] = r16;
    HEAP32[r17 + 2] = r16;
    return;
  }
  if ((r40 | 0) == 31) {
    r41 = 0;
  } else {
    r41 = 25 - (r40 >>> 1) | 0;
  }
  r40 = r38 << r41;
  r41 = HEAP32[r39 >> 2];
  while (1) {
    if ((HEAP32[r41 + 4 >> 2] & -8 | 0) == (r38 | 0)) {
      break;
    }
    r42 = (r40 >>> 31 << 2) + r41 + 16 | 0;
    r39 = HEAP32[r42 >> 2];
    if ((r39 | 0) == 0) {
      r4 = 2253;
      break;
    } else {
      r40 = r40 << 1;
      r41 = r39;
    }
  }
  if (r4 == 2253) {
    if (r42 >>> 0 < HEAP32[102858] >>> 0) {
      _abort();
    }
    HEAP32[r42 >> 2] = r28;
    HEAP32[r17 + 6] = r41;
    HEAP32[r17 + 3] = r16;
    HEAP32[r17 + 2] = r16;
    return;
  }
  r16 = r41 + 8 | 0;
  r42 = HEAP32[r16 >> 2];
  r4 = HEAP32[102858];
  if (r41 >>> 0 < r4 >>> 0) {
    _abort();
  }
  if (r42 >>> 0 < r4 >>> 0) {
    _abort();
  }
  HEAP32[r42 + 12 >> 2] = r28;
  HEAP32[r16 >> 2] = r28;
  HEAP32[r17 + 2] = r42;
  HEAP32[r17 + 3] = r41;
  HEAP32[r17 + 6] = 0;
  return;
}
function _init_top(r1, r2) {
  var r3, r4, r5;
  r3 = r1;
  r4 = r1 + 8 | 0;
  if ((r4 & 7 | 0) == 0) {
    r5 = 0;
  } else {
    r5 = -r4 & 7;
  }
  r4 = r2 - r5 | 0;
  HEAP32[102860] = r3 + r5 | 0;
  HEAP32[102857] = r4;
  HEAP32[r5 + (r3 + 4) >> 2] = r4 | 1;
  HEAP32[r2 + (r3 + 4) >> 2] = 40;
  HEAP32[102861] = HEAP32[102459];
  return;
}
function _init_bins() {
  var r1, r2, r3;
  r1 = 0;
  while (1) {
    r2 = r1 << 1;
    r3 = (r2 << 2) + 411456 | 0;
    HEAP32[(r2 + 3 << 2) + 411456 >> 2] = r3;
    HEAP32[(r2 + 2 << 2) + 411456 >> 2] = r3;
    r3 = r1 + 1 | 0;
    if ((r3 | 0) == 32) {
      break;
    } else {
      r1 = r3;
    }
  }
  return;
}
function _mmap_alloc() {}
function _prepend_alloc(r1, r2, r3) {
  var r4, r5, r6, r7, r8, r9, r10, r11, r12, r13, r14, r15, r16, r17, r18, r19, r20, r21, r22, r23, r24, r25, r26, r27, r28, r29, r30, r31, r32, r33, r34, r35, r36, r37, r38, r39, r40;
  r4 = r2 >> 2;
  r5 = r1 >> 2;
  r6 = 0;
  r7 = r1 + 8 | 0;
  if ((r7 & 7 | 0) == 0) {
    r8 = 0;
  } else {
    r8 = -r7 & 7;
  }
  r7 = r2 + 8 | 0;
  if ((r7 & 7 | 0) == 0) {
    r9 = 0, r10 = r9 >> 2;
  } else {
    r9 = -r7 & 7, r10 = r9 >> 2;
  }
  r7 = r2 + r9 | 0;
  r11 = r7;
  r12 = r8 + r3 | 0, r13 = r12 >> 2;
  r14 = r1 + r12 | 0;
  r12 = r14;
  r15 = r7 - (r1 + r8) - r3 | 0;
  HEAP32[(r8 + 4 >> 2) + r5] = r3 | 3;
  if ((r11 | 0) == (HEAP32[102860] | 0)) {
    r3 = HEAP32[102857] + r15 | 0;
    HEAP32[102857] = r3;
    HEAP32[102860] = r12;
    HEAP32[r13 + (r5 + 1)] = r3 | 1;
    r16 = r8 | 8;
    r17 = r1 + r16 | 0;
    return r17;
  }
  if ((r11 | 0) == (HEAP32[102859] | 0)) {
    r3 = HEAP32[102856] + r15 | 0;
    HEAP32[102856] = r3;
    HEAP32[102859] = r12;
    HEAP32[r13 + (r5 + 1)] = r3 | 1;
    HEAP32[(r3 >> 2) + r5 + r13] = r3;
    r16 = r8 | 8;
    r17 = r1 + r16 | 0;
    return r17;
  }
  r3 = HEAP32[r10 + (r4 + 1)];
  if ((r3 & 3 | 0) == 1) {
    r18 = r3 & -8;
    r19 = r3 >>> 3;
    L3015 : do {
      if (r3 >>> 0 < 256) {
        r20 = HEAP32[((r9 | 8) >> 2) + r4];
        r21 = HEAP32[r10 + (r4 + 3)];
        r22 = (r19 << 3) + 411456 | 0;
        do {
          if ((r20 | 0) != (r22 | 0)) {
            if (r20 >>> 0 < HEAP32[102858] >>> 0) {
              _abort();
            }
            if ((HEAP32[r20 + 12 >> 2] | 0) == (r11 | 0)) {
              break;
            }
            _abort();
          }
        } while (0);
        if ((r21 | 0) == (r20 | 0)) {
          HEAP32[102854] = HEAP32[102854] & (1 << r19 ^ -1);
          break;
        }
        do {
          if ((r21 | 0) != (r22 | 0)) {
            if (r21 >>> 0 < HEAP32[102858] >>> 0) {
              _abort();
            }
            if ((HEAP32[r21 + 8 >> 2] | 0) == (r11 | 0)) {
              break;
            }
            _abort();
          }
        } while (0);
        HEAP32[r20 + 12 >> 2] = r21;
        HEAP32[r21 + 8 >> 2] = r20;
      } else {
        r22 = r7;
        r23 = HEAP32[((r9 | 24) >> 2) + r4];
        r24 = HEAP32[r10 + (r4 + 3)];
        L3017 : do {
          if ((r24 | 0) == (r22 | 0)) {
            r25 = r9 | 16;
            r26 = r25 + (r2 + 4) | 0;
            r27 = HEAP32[r26 >> 2];
            do {
              if ((r27 | 0) == 0) {
                r28 = r2 + r25 | 0;
                r29 = HEAP32[r28 >> 2];
                if ((r29 | 0) == 0) {
                  r30 = 0, r31 = r30 >> 2;
                  break L3017;
                } else {
                  r32 = r29;
                  r33 = r28;
                  break;
                }
              } else {
                r32 = r27;
                r33 = r26;
              }
            } while (0);
            while (1) {
              r26 = r32 + 20 | 0;
              if ((HEAP32[r26 >> 2] | 0) == 0) {
                r27 = r32 + 16 | 0;
                if ((HEAP32[r27 >> 2] | 0) == 0) {
                  break;
                } else {
                  r34 = r27;
                }
              } else {
                r34 = r26;
              }
              r32 = HEAP32[r34 >> 2];
              r33 = r34;
            }
            if (r33 >>> 0 < HEAP32[102858] >>> 0) {
              _abort();
            } else {
              HEAP32[r33 >> 2] = 0;
              r30 = r32, r31 = r30 >> 2;
              break;
            }
          } else {
            r26 = HEAP32[((r9 | 8) >> 2) + r4];
            if (r26 >>> 0 < HEAP32[102858] >>> 0) {
              _abort();
            }
            r27 = r26 + 12 | 0;
            if ((HEAP32[r27 >> 2] | 0) != (r22 | 0)) {
              _abort();
            }
            r25 = r24 + 8 | 0;
            if ((HEAP32[r25 >> 2] | 0) == (r22 | 0)) {
              HEAP32[r27 >> 2] = r24;
              HEAP32[r25 >> 2] = r26;
              r30 = r24, r31 = r30 >> 2;
              break;
            } else {
              _abort();
            }
          }
        } while (0);
        if ((r23 | 0) == 0) {
          break;
        }
        r24 = r9 + (r2 + 28) | 0;
        r20 = (HEAP32[r24 >> 2] << 2) + 411720 | 0;
        do {
          if ((r22 | 0) == (HEAP32[r20 >> 2] | 0)) {
            HEAP32[r20 >> 2] = r30;
            if ((r30 | 0) != 0) {
              break;
            }
            HEAP32[102855] = HEAP32[102855] & (1 << HEAP32[r24 >> 2] ^ -1);
            break L3015;
          } else {
            if (r23 >>> 0 < HEAP32[102858] >>> 0) {
              _abort();
            }
            r21 = r23 + 16 | 0;
            if ((HEAP32[r21 >> 2] | 0) == (r22 | 0)) {
              HEAP32[r21 >> 2] = r30;
            } else {
              HEAP32[r23 + 20 >> 2] = r30;
            }
            if ((r30 | 0) == 0) {
              break L3015;
            }
          }
        } while (0);
        if (r30 >>> 0 < HEAP32[102858] >>> 0) {
          _abort();
        }
        HEAP32[r31 + 6] = r23;
        r22 = r9 | 16;
        r24 = HEAP32[(r22 >> 2) + r4];
        do {
          if ((r24 | 0) != 0) {
            if (r24 >>> 0 < HEAP32[102858] >>> 0) {
              _abort();
            } else {
              HEAP32[r31 + 4] = r24;
              HEAP32[r24 + 24 >> 2] = r30;
              break;
            }
          }
        } while (0);
        r24 = HEAP32[(r22 + 4 >> 2) + r4];
        if ((r24 | 0) == 0) {
          break;
        }
        if (r24 >>> 0 < HEAP32[102858] >>> 0) {
          _abort();
        } else {
          HEAP32[r31 + 5] = r24;
          HEAP32[r24 + 24 >> 2] = r30;
          break;
        }
      }
    } while (0);
    r35 = r2 + (r18 | r9) | 0;
    r36 = r18 + r15 | 0;
  } else {
    r35 = r11;
    r36 = r15;
  }
  r15 = r35 + 4 | 0;
  HEAP32[r15 >> 2] = HEAP32[r15 >> 2] & -2;
  HEAP32[r13 + (r5 + 1)] = r36 | 1;
  HEAP32[(r36 >> 2) + r5 + r13] = r36;
  r15 = r36 >>> 3;
  if (r36 >>> 0 < 256) {
    r35 = r15 << 1;
    r11 = (r35 << 2) + 411456 | 0;
    r18 = HEAP32[102854];
    r9 = 1 << r15;
    do {
      if ((r18 & r9 | 0) == 0) {
        HEAP32[102854] = r18 | r9;
        r37 = r11;
      } else {
        r15 = HEAP32[(r35 + 2 << 2) + 411456 >> 2];
        if (r15 >>> 0 >= HEAP32[102858] >>> 0) {
          r37 = r15;
          break;
        }
        _abort();
      }
    } while (0);
    HEAP32[(r35 + 2 << 2) + 411456 >> 2] = r12;
    HEAP32[r37 + 12 >> 2] = r12;
    HEAP32[r13 + (r5 + 2)] = r37;
    HEAP32[r13 + (r5 + 3)] = r11;
    r16 = r8 | 8;
    r17 = r1 + r16 | 0;
    return r17;
  }
  r11 = r14;
  r14 = r36 >>> 8;
  do {
    if ((r14 | 0) == 0) {
      r38 = 0;
    } else {
      if (r36 >>> 0 > 16777215) {
        r38 = 31;
        break;
      }
      r37 = (r14 + 1048320 | 0) >>> 16 & 8;
      r12 = r14 << r37;
      r35 = (r12 + 520192 | 0) >>> 16 & 4;
      r9 = r12 << r35;
      r12 = (r9 + 245760 | 0) >>> 16 & 2;
      r18 = 14 - (r35 | r37 | r12) + (r9 << r12 >>> 15) | 0;
      r38 = r36 >>> ((r18 + 7 | 0) >>> 0) & 1 | r18 << 1;
    }
  } while (0);
  r14 = (r38 << 2) + 411720 | 0;
  HEAP32[r13 + (r5 + 7)] = r38;
  HEAP32[r13 + (r5 + 5)] = 0;
  HEAP32[r13 + (r5 + 4)] = 0;
  r18 = HEAP32[102855];
  r12 = 1 << r38;
  if ((r18 & r12 | 0) == 0) {
    HEAP32[102855] = r18 | r12;
    HEAP32[r14 >> 2] = r11;
    HEAP32[r13 + (r5 + 6)] = r14;
    HEAP32[r13 + (r5 + 3)] = r11;
    HEAP32[r13 + (r5 + 2)] = r11;
    r16 = r8 | 8;
    r17 = r1 + r16 | 0;
    return r17;
  }
  if ((r38 | 0) == 31) {
    r39 = 0;
  } else {
    r39 = 25 - (r38 >>> 1) | 0;
  }
  r38 = r36 << r39;
  r39 = HEAP32[r14 >> 2];
  while (1) {
    if ((HEAP32[r39 + 4 >> 2] & -8 | 0) == (r36 | 0)) {
      break;
    }
    r40 = (r38 >>> 31 << 2) + r39 + 16 | 0;
    r14 = HEAP32[r40 >> 2];
    if ((r14 | 0) == 0) {
      r6 = 2367;
      break;
    } else {
      r38 = r38 << 1;
      r39 = r14;
    }
  }
  if (r6 == 2367) {
    if (r40 >>> 0 < HEAP32[102858] >>> 0) {
      _abort();
    }
    HEAP32[r40 >> 2] = r11;
    HEAP32[r13 + (r5 + 6)] = r39;
    HEAP32[r13 + (r5 + 3)] = r11;
    HEAP32[r13 + (r5 + 2)] = r11;
    r16 = r8 | 8;
    r17 = r1 + r16 | 0;
    return r17;
  }
  r40 = r39 + 8 | 0;
  r6 = HEAP32[r40 >> 2];
  r38 = HEAP32[102858];
  if (r39 >>> 0 < r38 >>> 0) {
    _abort();
  }
  if (r6 >>> 0 < r38 >>> 0) {
    _abort();
  }
  HEAP32[r6 + 12 >> 2] = r11;
  HEAP32[r40 >> 2] = r11;
  HEAP32[r13 + (r5 + 2)] = r6;
  HEAP32[r13 + (r5 + 3)] = r39;
  HEAP32[r13 + (r5 + 6)] = 0;
  r16 = r8 | 8;
  r17 = r1 + r16 | 0;
  return r17;
}
function _add_segment(r1, r2) {
  var r3, r4, r5, r6, r7, r8, r9, r10, r11, r12, r13, r14, r15;
  r3 = 0;
  r4 = HEAP32[102860], r5 = r4 >> 2;
  r6 = r4;
  r7 = _segment_holding(r6);
  r8 = HEAP32[r7 >> 2];
  r9 = HEAP32[r7 + 4 >> 2];
  r7 = r8 + r9 | 0;
  r10 = r8 + (r9 - 39) | 0;
  if ((r10 & 7 | 0) == 0) {
    r11 = 0;
  } else {
    r11 = -r10 & 7;
  }
  r10 = r8 + (r9 - 47) + r11 | 0;
  r11 = r10 >>> 0 < (r4 + 16 | 0) >>> 0 ? r6 : r10;
  r10 = r11 + 8 | 0, r9 = r10 >> 2;
  _init_top(r1, r2 - 40 | 0);
  HEAP32[r11 + 4 >> 2] = 27;
  HEAP32[r9] = HEAP32[102966];
  HEAP32[r9 + 1] = HEAP32[102967];
  HEAP32[r9 + 2] = HEAP32[102968];
  HEAP32[r9 + 3] = HEAP32[102969];
  HEAP32[102966] = r1;
  HEAP32[102967] = r2;
  HEAP32[102969] = 0;
  HEAP32[102968] = r10;
  r10 = r11 + 28 | 0;
  HEAP32[r10 >> 2] = 7;
  L3128 : do {
    if ((r11 + 32 | 0) >>> 0 < r7 >>> 0) {
      r2 = r10;
      while (1) {
        r1 = r2 + 4 | 0;
        HEAP32[r1 >> 2] = 7;
        if ((r2 + 8 | 0) >>> 0 < r7 >>> 0) {
          r2 = r1;
        } else {
          break L3128;
        }
      }
    }
  } while (0);
  if ((r11 | 0) == (r6 | 0)) {
    return;
  }
  r7 = r11 - r4 | 0;
  r11 = r7 + (r6 + 4) | 0;
  HEAP32[r11 >> 2] = HEAP32[r11 >> 2] & -2;
  HEAP32[r5 + 1] = r7 | 1;
  HEAP32[r6 + r7 >> 2] = r7;
  r6 = r7 >>> 3;
  if (r7 >>> 0 < 256) {
    r11 = r6 << 1;
    r10 = (r11 << 2) + 411456 | 0;
    r2 = HEAP32[102854];
    r1 = 1 << r6;
    do {
      if ((r2 & r1 | 0) == 0) {
        HEAP32[102854] = r2 | r1;
        r12 = r10;
      } else {
        r6 = HEAP32[(r11 + 2 << 2) + 411456 >> 2];
        if (r6 >>> 0 >= HEAP32[102858] >>> 0) {
          r12 = r6;
          break;
        }
        _abort();
      }
    } while (0);
    HEAP32[(r11 + 2 << 2) + 411456 >> 2] = r4;
    HEAP32[r12 + 12 >> 2] = r4;
    HEAP32[r5 + 2] = r12;
    HEAP32[r5 + 3] = r10;
    return;
  }
  r10 = r4;
  r12 = r7 >>> 8;
  do {
    if ((r12 | 0) == 0) {
      r13 = 0;
    } else {
      if (r7 >>> 0 > 16777215) {
        r13 = 31;
        break;
      }
      r11 = (r12 + 1048320 | 0) >>> 16 & 8;
      r1 = r12 << r11;
      r2 = (r1 + 520192 | 0) >>> 16 & 4;
      r6 = r1 << r2;
      r1 = (r6 + 245760 | 0) >>> 16 & 2;
      r9 = 14 - (r2 | r11 | r1) + (r6 << r1 >>> 15) | 0;
      r13 = r7 >>> ((r9 + 7 | 0) >>> 0) & 1 | r9 << 1;
    }
  } while (0);
  r12 = (r13 << 2) + 411720 | 0;
  HEAP32[r5 + 7] = r13;
  HEAP32[r5 + 5] = 0;
  HEAP32[r5 + 4] = 0;
  r9 = HEAP32[102855];
  r1 = 1 << r13;
  if ((r9 & r1 | 0) == 0) {
    HEAP32[102855] = r9 | r1;
    HEAP32[r12 >> 2] = r10;
    HEAP32[r5 + 6] = r12;
    HEAP32[r5 + 3] = r4;
    HEAP32[r5 + 2] = r4;
    return;
  }
  if ((r13 | 0) == 31) {
    r14 = 0;
  } else {
    r14 = 25 - (r13 >>> 1) | 0;
  }
  r13 = r7 << r14;
  r14 = HEAP32[r12 >> 2];
  while (1) {
    if ((HEAP32[r14 + 4 >> 2] & -8 | 0) == (r7 | 0)) {
      break;
    }
    r15 = (r13 >>> 31 << 2) + r14 + 16 | 0;
    r12 = HEAP32[r15 >> 2];
    if ((r12 | 0) == 0) {
      r3 = 2411;
      break;
    } else {
      r13 = r13 << 1;
      r14 = r12;
    }
  }
  if (r3 == 2411) {
    if (r15 >>> 0 < HEAP32[102858] >>> 0) {
      _abort();
    }
    HEAP32[r15 >> 2] = r10;
    HEAP32[r5 + 6] = r14;
    HEAP32[r5 + 3] = r4;
    HEAP32[r5 + 2] = r4;
    return;
  }
  r4 = r14 + 8 | 0;
  r15 = HEAP32[r4 >> 2];
  r3 = HEAP32[102858];
  if (r14 >>> 0 < r3 >>> 0) {
    _abort();
  }
  if (r15 >>> 0 < r3 >>> 0) {
    _abort();
  }
  HEAP32[r15 + 12 >> 2] = r10;
  HEAP32[r4 >> 2] = r10;
  HEAP32[r5 + 2] = r15;
  HEAP32[r5 + 3] = r14;
  HEAP32[r5 + 6] = 0;
  return;
}
function __ZNKSt9bad_alloc4whatEv(r1) {
  return 411164;
}
function __ZNKSt20bad_array_new_length4whatEv(r1) {
  return 411308;
}
function __ZSt15get_new_handlerv() {
  return tempValue = HEAP32[103002], HEAP32[103002] = tempValue, tempValue;
}
function __ZSt15set_new_handlerPFvvE(r1) {
  return tempValue = HEAP32[103002], HEAP32[103002] = r1, tempValue;
}
function __ZNSt9bad_allocC2Ev(r1) {
  HEAP32[r1 >> 2] = 411896;
  return;
}
function __ZdlPv(r1) {
  if ((r1 | 0) == 0) {
    return;
  }
  _free(r1);
  return;
}
function __ZdlPvRKSt9nothrow_t(r1, r2) {
  __ZdlPv(r1);
  return;
}
function __ZdaPv(r1) {
  __ZdlPv(r1);
  return;
}
function __ZdaPvRKSt9nothrow_t(r1, r2) {
  __ZdaPv(r1);
  return;
}
function __ZNSt9bad_allocD0Ev(r1) {
  __ZNSt9bad_allocD2Ev(r1);
  __ZdlPv(r1);
  return;
}
function __ZNSt9bad_allocD2Ev(r1) {
  return;
}
function __ZNSt20bad_array_new_lengthC2Ev(r1) {
  __ZNSt9bad_allocC2Ev(r1 | 0);
  HEAP32[r1 >> 2] = 411920;
  return;
}
function __ZNSt20bad_array_new_lengthD0Ev(r1) {
  __ZNSt9bad_allocD2Ev(r1 | 0);
  __ZdlPv(r1);
  return;
}
function _getopt(r1, r2, r3) {
  return _getopt_internal(r1, r2, r3, 0, 0, 0);
}
function _getopt_internal(r1, r2, r3, r4, r5, r6) {
  var r7, r8, r9, r10, r11, r12, r13, r14, r15;
  r7 = r2 >> 2;
  r8 = 0;
  r9 = STACKTOP;
  if ((r3 | 0) == 0) {
    r10 = -1;
    STACKTOP = r9;
    return r10;
  }
  if ((HEAP32[102440] | 0) == 0) {
    HEAP32[102438] = 1;
    HEAP32[102440] = 1;
  }
  if ((HEAP32[102478] | 0) == -1 | (HEAP32[102438] | 0) != 0) {
    HEAP32[102478] = (_getenv(411120) | 0) != 0 & 1;
  }
  r11 = HEAP8[r3];
  if (r11 << 24 >> 24 == 45) {
    r12 = r6 | 2;
  } else {
    r12 = (HEAP32[102478] | 0) != 0 | r11 << 24 >> 24 == 43 ? r6 & -2 : r6;
  }
  r6 = HEAP8[r3];
  if (r6 << 24 >> 24 == 43 | r6 << 24 >> 24 == 45) {
    r13 = r3 + 1 | 0;
  } else {
    r13 = r3;
  }
  HEAP32[102442] = 0;
  do {
    if ((HEAP32[102438] | 0) == 0) {
      r8 = 2457;
    } else {
      HEAP32[102444] = -1;
      HEAP32[102443] = -1;
      r8 = 2456;
      break;
    }
  } while (0);
  while (1) {
    if (r8 == 2456) {
      r8 = 0;
      if ((HEAP32[102438] | 0) == 0) {
        r8 = 2457;
        continue;
      }
    } else if (r8 == 2457) {
      r8 = 0;
      if (HEAP8[HEAP32[102437]] << 24 >> 24 != 0) {
        break;
      }
    }
    HEAP32[102438] = 0;
    r3 = HEAP32[102440];
    if ((r3 | 0) >= (r1 | 0)) {
      r8 = 2459;
      break;
    }
    r6 = HEAP32[(r3 << 2 >> 2) + r7];
    HEAP32[102437] = r6;
    if (HEAP8[r6] << 24 >> 24 == 45) {
      if (HEAP8[r6 + 1 | 0] << 24 >> 24 != 0) {
        r8 = 2475;
        break;
      }
      if ((_strchr(r13, 45) | 0) != 0) {
        r8 = 2475;
        break;
      }
    }
    HEAP32[102437] = 411268;
    if ((r12 & 2 | 0) != 0) {
      r8 = 2468;
      break;
    }
    if ((r12 & 1 | 0) == 0) {
      r10 = -1;
      r8 = 2527;
      break;
    }
    r6 = HEAP32[102443];
    do {
      if ((r6 | 0) == -1) {
        HEAP32[102443] = HEAP32[102440];
      } else {
        r3 = HEAP32[102444];
        if ((r3 | 0) == -1) {
          break;
        }
        _permute_args(r6, r3, HEAP32[102440], r2);
        HEAP32[102443] = HEAP32[102440] - HEAP32[102444] + HEAP32[102443] | 0;
        HEAP32[102444] = -1;
      }
    } while (0);
    HEAP32[102440] = HEAP32[102440] + 1 | 0;
    r8 = 2456;
    continue;
  }
  do {
    if (r8 == 2468) {
      r6 = HEAP32[102440];
      HEAP32[102440] = r6 + 1 | 0;
      HEAP32[102442] = HEAP32[(r6 << 2 >> 2) + r7];
      r10 = 1;
      STACKTOP = r9;
      return r10;
    } else if (r8 == 2459) {
      HEAP32[102437] = 411268;
      r6 = HEAP32[102444];
      r3 = HEAP32[102443];
      do {
        if ((r6 | 0) == -1) {
          if ((r3 | 0) == -1) {
            break;
          }
          HEAP32[102440] = r3;
        } else {
          _permute_args(r3, r6, HEAP32[102440], r2);
          HEAP32[102440] = HEAP32[102443] - HEAP32[102444] + HEAP32[102440] | 0;
        }
      } while (0);
      HEAP32[102444] = -1;
      HEAP32[102443] = -1;
      r10 = -1;
      STACKTOP = r9;
      return r10;
    } else if (r8 == 2475) {
      if ((HEAP32[102443] | 0) != -1 & (HEAP32[102444] | 0) == -1) {
        HEAP32[102444] = HEAP32[102440];
      }
      r6 = HEAP32[102437];
      r3 = r6 + 1 | 0;
      if (HEAP8[r3] << 24 >> 24 == 0) {
        break;
      }
      HEAP32[102437] = r3;
      if (HEAP8[r3] << 24 >> 24 != 45) {
        break;
      }
      if (HEAP8[r6 + 2 | 0] << 24 >> 24 != 0) {
        break;
      }
      HEAP32[102440] = HEAP32[102440] + 1 | 0;
      HEAP32[102437] = 411268;
      r6 = HEAP32[102444];
      if ((r6 | 0) != -1) {
        _permute_args(HEAP32[102443], r6, HEAP32[102440], r2);
        HEAP32[102440] = HEAP32[102443] - HEAP32[102444] + HEAP32[102440] | 0;
      }
      HEAP32[102444] = -1;
      HEAP32[102443] = -1;
      r10 = -1;
      STACKTOP = r9;
      return r10;
    } else if (r8 == 2527) {
      STACKTOP = r9;
      return r10;
    }
  } while (0);
  r6 = (r4 | 0) != 0;
  do {
    if (r6) {
      r3 = HEAP32[102437];
      if ((r3 | 0) == (HEAP32[(HEAP32[102440] << 2 >> 2) + r7] | 0)) {
        break;
      }
      if (HEAP8[r3] << 24 >> 24 != 45) {
        if ((r12 & 4 | 0) == 0) {
          break;
        }
      }
      r3 = HEAP32[102437];
      r11 = HEAP8[r3];
      if (r11 << 24 >> 24 == 58) {
        r14 = 0;
      } else if (r11 << 24 >> 24 == 45) {
        HEAP32[102437] = r3 + 1 | 0;
        r14 = 0;
      } else {
        r14 = (_strchr(r13, r11 << 24 >> 24) | 0) != 0 & 1;
      }
      r11 = _parse_long_options(r2, r13, r4, r5, r14);
      if ((r11 | 0) == -1) {
        break;
      }
      HEAP32[102437] = 411268;
      r10 = r11;
      STACKTOP = r9;
      return r10;
    }
  } while (0);
  r14 = HEAP32[102437];
  r12 = r14 + 1 | 0;
  HEAP32[102437] = r12;
  r11 = HEAP8[r14];
  r14 = r11 << 24 >> 24;
  do {
    if (r11 << 24 >> 24 == 45) {
      if (HEAP8[r12] << 24 >> 24 == 0) {
        r8 = 2494;
        break;
      } else {
        r8 = 2496;
        break;
      }
    } else if (r11 << 24 >> 24 != 58) {
      r8 = 2494;
    }
  } while (0);
  do {
    if (r8 == 2494) {
      r12 = _strchr(r13, r14);
      if ((r12 | 0) == 0) {
        if (r11 << 24 >> 24 == 45) {
          r8 = 2496;
          break;
        } else {
          break;
        }
      }
      do {
        if (r6 & r11 << 24 >> 24 == 87) {
          if (HEAP8[r12 + 1 | 0] << 24 >> 24 != 59) {
            break;
          }
          do {
            if (HEAP8[HEAP32[102437]] << 24 >> 24 == 0) {
              r3 = HEAP32[102440] + 1 | 0;
              HEAP32[102440] = r3;
              if ((r3 | 0) < (r1 | 0)) {
                HEAP32[102437] = HEAP32[(r3 << 2 >> 2) + r7];
                break;
              }
              HEAP32[102437] = 411268;
              do {
                if ((HEAP32[102441] | 0) != 0) {
                  if (HEAP8[r13] << 24 >> 24 == 58) {
                    break;
                  }
                  __warnx(409640, (tempInt = STACKTOP, STACKTOP = STACKTOP + 4 | 0, HEAP32[tempInt >> 2] = r14, tempInt));
                }
              } while (0);
              HEAP32[102439] = r14;
              r10 = HEAP8[r13] << 24 >> 24 == 58 ? 58 : 63;
              STACKTOP = r9;
              return r10;
            }
          } while (0);
          r3 = _parse_long_options(r2, r13, r4, r5, 0);
          HEAP32[102437] = 411268;
          r10 = r3;
          STACKTOP = r9;
          return r10;
        }
      } while (0);
      if (HEAP8[r12 + 1 | 0] << 24 >> 24 != 58) {
        if (HEAP8[HEAP32[102437]] << 24 >> 24 != 0) {
          r10 = r14;
          STACKTOP = r9;
          return r10;
        }
        HEAP32[102440] = HEAP32[102440] + 1 | 0;
        r10 = r14;
        STACKTOP = r9;
        return r10;
      }
      HEAP32[102442] = 0;
      r3 = HEAP32[102437];
      do {
        if (HEAP8[r3] << 24 >> 24 == 0) {
          if (HEAP8[r12 + 2 | 0] << 24 >> 24 == 58) {
            break;
          }
          r15 = HEAP32[102440] + 1 | 0;
          HEAP32[102440] = r15;
          if ((r15 | 0) < (r1 | 0)) {
            HEAP32[102442] = HEAP32[(r15 << 2 >> 2) + r7];
            break;
          }
          HEAP32[102437] = 411268;
          do {
            if ((HEAP32[102441] | 0) != 0) {
              if (HEAP8[r13] << 24 >> 24 == 58) {
                break;
              }
              __warnx(409640, (tempInt = STACKTOP, STACKTOP = STACKTOP + 4 | 0, HEAP32[tempInt >> 2] = r14, tempInt));
            }
          } while (0);
          HEAP32[102439] = r14;
          r10 = HEAP8[r13] << 24 >> 24 == 58 ? 58 : 63;
          STACKTOP = r9;
          return r10;
        } else {
          HEAP32[102442] = r3;
        }
      } while (0);
      HEAP32[102437] = 411268;
      HEAP32[102440] = HEAP32[102440] + 1 | 0;
      r10 = r14;
      STACKTOP = r9;
      return r10;
    }
  } while (0);
  do {
    if (r8 == 2496) {
      if (HEAP8[HEAP32[102437]] << 24 >> 24 == 0) {
        r10 = -1;
      } else {
        break;
      }
      STACKTOP = r9;
      return r10;
    }
  } while (0);
  if (HEAP8[HEAP32[102437]] << 24 >> 24 == 0) {
    HEAP32[102440] = HEAP32[102440] + 1 | 0;
  }
  do {
    if ((HEAP32[102441] | 0) != 0) {
      if (HEAP8[r13] << 24 >> 24 == 58) {
        break;
      }
      __warnx(409888, (tempInt = STACKTOP, STACKTOP = STACKTOP + 4 | 0, HEAP32[tempInt >> 2] = r14, tempInt));
    }
  } while (0);
  HEAP32[102439] = r14;
  r10 = 63;
  STACKTOP = r9;
  return r10;
}
function _getopt_long(r1, r2, r3, r4, r5) {
  return _getopt_internal(r1, r2, r3, r4, r5, 1);
}
function _getopt_long_only(r1, r2, r3, r4, r5) {
  return _getopt_internal(r1, r2, r3, r4, r5, 5);
}
function _permute_args(r1, r2, r3, r4) {
  var r5, r6, r7, r8, r9, r10, r11, r12, r13, r14, r15;
  r5 = r2 - r1 | 0;
  r6 = r3 - r2 | 0;
  r7 = _gcd(r5, r6);
  r8 = (r3 - r1 | 0) / (r7 | 0) & -1;
  if ((r7 | 0) <= 0) {
    return;
  }
  r1 = (r8 | 0) > 0;
  r3 = -r5 | 0;
  r5 = 0;
  while (1) {
    r9 = r5 + r2 | 0;
    L3326 : do {
      if (r1) {
        r10 = (r9 << 2) + r4 | 0;
        r11 = 0;
        r12 = r9;
        while (1) {
          r13 = ((r12 | 0) < (r2 | 0) ? r6 : r3) + r12 | 0;
          r14 = (r13 << 2) + r4 | 0;
          r15 = HEAP32[r14 >> 2];
          HEAP32[r14 >> 2] = HEAP32[r10 >> 2];
          HEAP32[r10 >> 2] = r15;
          r15 = r11 + 1 | 0;
          if ((r15 | 0) == (r8 | 0)) {
            break L3326;
          } else {
            r11 = r15;
            r12 = r13;
          }
        }
      }
    } while (0);
    r9 = r5 + 1 | 0;
    if ((r9 | 0) == (r7 | 0)) {
      break;
    } else {
      r5 = r9;
    }
  }
  return;
}
function __Znwj(r1) {
  var r2, r3, r4;
  r2 = 0;
  r3 = (r1 | 0) == 0 ? 1 : r1;
  while (1) {
    r4 = _malloc(r3);
    if ((r4 | 0) != 0) {
      r2 = 2561;
      break;
    }
    r1 = __ZSt15get_new_handlerv();
    if ((r1 | 0) == 0) {
      break;
    }
    FUNCTION_TABLE[r1]();
  }
  if (r2 == 2561) {
    return r4;
  }
  r4 = ___cxa_allocate_exception(4);
  __ZNSt9bad_allocC2Ev(r4);
  ___cxa_throw(r4, 411980, 36);
}
function __ZnwjRKSt9nothrow_t(r1, r2) {
  return __Znwj(r1);
}
function __Znaj(r1) {
  return __Znwj(r1);
}
function __ZnajRKSt9nothrow_t(r1, r2) {
  return __Znaj(r1);
}
function __ZSt17__throw_bad_allocv() {
  var r1;
  r1 = ___cxa_allocate_exception(4);
  __ZNSt9bad_allocC2Ev(r1);
  ___cxa_throw(r1, 411980, 36);
}
function _strtof(r1, r2) {
  return 0;
}
function _gcd(r1, r2) {
  var r3, r4, r5, r6;
  r3 = (r1 | 0) % (r2 | 0);
  if ((r3 | 0) == 0) {
    r4 = r2;
    return r4;
  } else {
    r5 = r2;
    r6 = r3;
  }
  while (1) {
    r3 = (r5 | 0) % (r6 | 0);
    if ((r3 | 0) == 0) {
      r4 = r6;
      break;
    } else {
      r5 = r6;
      r6 = r3;
    }
  }
  return r4;
}
function _parse_long_options(r1, r2, r3, r4, r5) {
  var r6, r7, r8, r9, r10, r11, r12, r13, r14, r15, r16, r17, r18, r19, r20, r21, r22, r23;
  r6 = r3 >> 2;
  r7 = 0;
  r8 = STACKTOP;
  r9 = HEAP32[102437];
  HEAP32[102440] = HEAP32[102440] + 1 | 0;
  r10 = _strchr(r9, 61);
  if ((r10 | 0) == 0) {
    r11 = _strlen(r9);
    r12 = 0;
  } else {
    r11 = r10 - r9 | 0;
    r12 = r10 + 1 | 0;
  }
  r10 = HEAP32[r6];
  do {
    if ((r10 | 0) != 0) {
      r13 = (r5 | 0) != 0 & (r11 | 0) == 1;
      r14 = 0;
      r15 = -1;
      r16 = r10;
      L3362 : while (1) {
        do {
          if ((_strncmp(r9, r16, r11) | 0) == 0) {
            if ((_strlen(r16) | 0) == (r11 | 0)) {
              r17 = r14;
              break L3362;
            }
            if (r13) {
              r18 = r15;
              break;
            }
            if ((r15 | 0) == -1) {
              r18 = r14;
            } else {
              r7 = 2593;
              break L3362;
            }
          } else {
            r18 = r15;
          }
        } while (0);
        r19 = r14 + 1 | 0;
        r20 = HEAP32[(r19 << 4 >> 2) + r6];
        if ((r20 | 0) == 0) {
          r17 = r18;
          break;
        } else {
          r14 = r19;
          r15 = r18;
          r16 = r20;
        }
      }
      if (r7 == 2593) {
        do {
          if ((HEAP32[102441] | 0) != 0) {
            if (HEAP8[r2] << 24 >> 24 == 58) {
              break;
            }
            __warnx(411084, (tempInt = STACKTOP, STACKTOP = STACKTOP + 8 | 0, HEAP32[tempInt >> 2] = r11, HEAP32[tempInt + 4 >> 2] = r9, tempInt));
          }
        } while (0);
        HEAP32[102439] = 0;
        r21 = 63;
        STACKTOP = r8;
        return r21;
      }
      if ((r17 | 0) == -1) {
        break;
      }
      r16 = (r17 << 4) + r3 + 4 | 0;
      r15 = HEAP32[r16 >> 2];
      r14 = (r12 | 0) == 0;
      if (!((r15 | 0) != 0 | r14)) {
        do {
          if ((HEAP32[102441] | 0) != 0) {
            if (HEAP8[r2] << 24 >> 24 == 58) {
              break;
            }
            __warnx(409780, (tempInt = STACKTOP, STACKTOP = STACKTOP + 8 | 0, HEAP32[tempInt >> 2] = r11, HEAP32[tempInt + 4 >> 2] = r9, tempInt));
          }
        } while (0);
        if ((HEAP32[((r17 << 4) + 8 >> 2) + r6] | 0) == 0) {
          r22 = HEAP32[((r17 << 4) + 12 >> 2) + r6];
        } else {
          r22 = 0;
        }
        HEAP32[102439] = r22;
        r21 = HEAP8[r2] << 24 >> 24 == 58 ? 58 : 63;
        STACKTOP = r8;
        return r21;
      }
      do {
        if ((r15 - 1 | 0) >>> 0 < 2) {
          if (!r14) {
            HEAP32[102442] = r12;
            break;
          }
          if ((r15 | 0) != 1) {
            break;
          }
          r13 = HEAP32[102440];
          HEAP32[102440] = r13 + 1 | 0;
          HEAP32[102442] = HEAP32[r1 + (r13 << 2) >> 2];
        }
      } while (0);
      if (!((HEAP32[r16 >> 2] | 0) == 1 & (HEAP32[102442] | 0) == 0)) {
        if ((r4 | 0) != 0) {
          HEAP32[r4 >> 2] = r17;
        }
        r15 = HEAP32[((r17 << 4) + 8 >> 2) + r6];
        r14 = HEAP32[((r17 << 4) + 12 >> 2) + r6];
        if ((r15 | 0) == 0) {
          r21 = r14;
          STACKTOP = r8;
          return r21;
        }
        HEAP32[r15 >> 2] = r14;
        r21 = 0;
        STACKTOP = r8;
        return r21;
      }
      do {
        if ((HEAP32[102441] | 0) != 0) {
          if (HEAP8[r2] << 24 >> 24 == 58) {
            break;
          }
          __warnx(409604, (tempInt = STACKTOP, STACKTOP = STACKTOP + 4 | 0, HEAP32[tempInt >> 2] = r9, tempInt));
        }
      } while (0);
      if ((HEAP32[((r17 << 4) + 8 >> 2) + r6] | 0) == 0) {
        r23 = HEAP32[((r17 << 4) + 12 >> 2) + r6];
      } else {
        r23 = 0;
      }
      HEAP32[102439] = r23;
      HEAP32[102440] = HEAP32[102440] - 1 | 0;
      r21 = HEAP8[r2] << 24 >> 24 == 58 ? 58 : 63;
      STACKTOP = r8;
      return r21;
    }
  } while (0);
  if ((r5 | 0) != 0) {
    HEAP32[102440] = HEAP32[102440] - 1 | 0;
    r21 = -1;
    STACKTOP = r8;
    return r21;
  }
  do {
    if ((HEAP32[102441] | 0) != 0) {
      if (HEAP8[r2] << 24 >> 24 == 58) {
        break;
      }
      __warnx(409864, (tempInt = STACKTOP, STACKTOP = STACKTOP + 4 | 0, HEAP32[tempInt >> 2] = r9, tempInt));
    }
  } while (0);
  HEAP32[102439] = 0;
  r21 = 63;
  STACKTOP = r8;
  return r21;
}
function __warn(r1, r2) {
  var r3, r4;
  r3 = STACKTOP;
  STACKTOP = STACKTOP + 4 | 0;
  r4 = r3;
  HEAP32[r4 >> 2] = r2;
  __vwarn(r1, HEAP32[r4 >> 2]);
  STACKTOP = r3;
  return;
}
function __warnx(r1, r2) {
  var r3, r4;
  r3 = STACKTOP;
  STACKTOP = STACKTOP + 4 | 0;
  r4 = r3;
  HEAP32[r4 >> 2] = r2;
  __vwarnx(r1, HEAP32[r4 >> 2]);
  STACKTOP = r3;
  return;
}
function __vwarn(r1, r2) {
  var r3, r4, r5;
  r3 = STACKTOP;
  r4 = HEAP32[___errno_location() >> 2];
  r5 = HEAP32[___progname >> 2];
  _fprintf(HEAP32[_stderr >> 2], 411260, (tempInt = STACKTOP, STACKTOP = STACKTOP + 4 | 0, HEAP32[tempInt >> 2] = r5, tempInt));
  if ((r1 | 0) != 0) {
    _fprintf(HEAP32[_stderr >> 2], r1, r2);
    _fwrite(411336, 2, 1, HEAP32[_stderr >> 2]);
  }
  r2 = HEAP32[_stderr >> 2];
  r1 = _strerror(r4);
  _fprintf(r2, 411216, (tempInt = STACKTOP, STACKTOP = STACKTOP + 4 | 0, HEAP32[tempInt >> 2] = r1, tempInt));
  STACKTOP = r3;
  return;
}
function __vwarnx(r1, r2) {
  var r3, r4;
  r3 = STACKTOP;
  r4 = HEAP32[___progname >> 2];
  _fprintf(HEAP32[_stderr >> 2], 411208, (tempInt = STACKTOP, STACKTOP = STACKTOP + 4 | 0, HEAP32[tempInt >> 2] = r4, tempInt));
  if ((r1 | 0) != 0) {
    _fprintf(HEAP32[_stderr >> 2], r1, r2);
  }
  _fputc(10, HEAP32[_stderr >> 2]);
  STACKTOP = r3;
  return;
}
function _strtod(r1, r2) {
  var r3, r4, r5, r6, r7, r8, r9, r10, r11, r12, r13, r14, r15, r16, r17, r18, r19, r20, r21, r22, r23, r24, r25, r26, r27, r28, r29, r30, r31, r32, r33, r34, r35, r36, r37, r38, r39;
  r3 = 0;
  r4 = r1;
  while (1) {
    if ((_isspace(HEAP8[r4] << 24 >> 24) | 0) == 0) {
      break;
    } else {
      r4 = r4 + 1 | 0;
    }
  }
  r5 = HEAP8[r4];
  if (r5 << 24 >> 24 == 43) {
    r6 = r4 + 1 | 0;
    r7 = 0;
  } else if (r5 << 24 >> 24 == 45) {
    r6 = r4 + 1 | 0;
    r7 = 1;
  } else {
    r6 = r4;
    r7 = 0;
  }
  r4 = -1;
  r5 = 0;
  r8 = r6;
  while (1) {
    r6 = HEAP8[r8];
    if (((r6 << 24 >> 24) - 48 | 0) >>> 0 < 10) {
      r9 = r4;
    } else {
      if (r6 << 24 >> 24 != 46 | (r4 | 0) > -1) {
        break;
      } else {
        r9 = r5;
      }
    }
    r4 = r9;
    r5 = r5 + 1 | 0;
    r8 = r8 + 1 | 0;
  }
  r9 = r8 + -r5 | 0;
  r6 = (r4 | 0) < 0;
  r10 = ((r6 ^ 1) << 31 >> 31) + r5 | 0;
  r11 = (r10 | 0) > 18;
  r12 = (r11 ? -18 : -r10 | 0) + (r6 ? r5 : r4) | 0;
  r4 = r11 ? 18 : r10;
  do {
    if ((r4 | 0) == 0) {
      r13 = r1;
      r14 = 0;
    } else {
      do {
        if ((r4 | 0) > 9) {
          r10 = r9;
          r11 = r4;
          r5 = 0;
          while (1) {
            r6 = HEAP8[r10];
            r15 = r10 + 1 | 0;
            if (r6 << 24 >> 24 == 46) {
              r16 = HEAP8[r15];
              r17 = r10 + 2 | 0;
            } else {
              r16 = r6;
              r17 = r15;
            }
            r18 = (r16 << 24 >> 24) + ((r5 * 10 & -1) - 48) | 0;
            r15 = r11 - 1 | 0;
            if ((r15 | 0) > 9) {
              r10 = r17;
              r11 = r15;
              r5 = r18;
            } else {
              break;
            }
          }
          r19 = (r18 | 0) * 1e9;
          r20 = 9;
          r21 = r17;
          r3 = 2657;
          break;
        } else {
          if ((r4 | 0) > 0) {
            r19 = 0;
            r20 = r4;
            r21 = r9;
            r3 = 2657;
            break;
          } else {
            r22 = 0;
            r23 = 0;
            break;
          }
        }
      } while (0);
      if (r3 == 2657) {
        r5 = r21;
        r11 = r20;
        r10 = 0;
        while (1) {
          r15 = HEAP8[r5];
          r6 = r5 + 1 | 0;
          if (r15 << 24 >> 24 == 46) {
            r24 = HEAP8[r6];
            r25 = r5 + 2 | 0;
          } else {
            r24 = r15;
            r25 = r6;
          }
          r26 = (r24 << 24 >> 24) + ((r10 * 10 & -1) - 48) | 0;
          r6 = r11 - 1 | 0;
          if ((r6 | 0) > 0) {
            r5 = r25;
            r11 = r6;
            r10 = r26;
          } else {
            break;
          }
        }
        r22 = r26 | 0;
        r23 = r19;
      }
      r10 = r23 + r22;
      r11 = HEAP8[r8];
      L3467 : do {
        if (r11 << 24 >> 24 == 69 | r11 << 24 >> 24 == 101) {
          r5 = r8 + 1 | 0;
          r6 = HEAP8[r5];
          if (r6 << 24 >> 24 == 45) {
            r27 = r8 + 2 | 0;
            r28 = 1;
          } else if (r6 << 24 >> 24 == 43) {
            r27 = r8 + 2 | 0;
            r28 = 0;
          } else {
            r27 = r5;
            r28 = 0;
          }
          if (((HEAP8[r27] << 24 >> 24) - 48 | 0) >>> 0 < 10) {
            r29 = r27;
            r30 = 0;
          } else {
            r31 = 0;
            r32 = r27;
            r33 = r28;
            break;
          }
          while (1) {
            r5 = (HEAP8[r29] << 24 >> 24) + ((r30 * 10 & -1) - 48) | 0;
            r6 = r29 + 1 | 0;
            if (((HEAP8[r6] << 24 >> 24) - 48 | 0) >>> 0 < 10) {
              r29 = r6;
              r30 = r5;
            } else {
              r31 = r5;
              r32 = r6;
              r33 = r28;
              break L3467;
            }
          }
        } else {
          r31 = 0;
          r32 = r8;
          r33 = 0;
        }
      } while (0);
      r11 = r12 + ((r33 | 0) == 0 ? r31 : -r31 | 0) | 0;
      r6 = (r11 | 0) < 0 ? -r11 | 0 : r11;
      do {
        if ((r6 | 0) > 511) {
          HEAP32[___errno_location() >> 2] = 34;
          r34 = 1;
          r35 = 409676;
          r36 = 511;
          r3 = 2674;
          break;
        } else {
          if ((r6 | 0) == 0) {
            r37 = 1;
            break;
          } else {
            r34 = 1;
            r35 = 409676;
            r36 = r6;
            r3 = 2674;
            break;
          }
        }
      } while (0);
      L3479 : do {
        if (r3 == 2674) {
          while (1) {
            r3 = 0;
            if ((r36 & 1 | 0) == 0) {
              r38 = r34;
            } else {
              r38 = r34 * (HEAP32[tempDoublePtr >> 2] = HEAP32[r35 >> 2], HEAP32[tempDoublePtr + 4 >> 2] = HEAP32[r35 + 4 >> 2], HEAPF64[tempDoublePtr >> 3]);
            }
            r6 = r36 >> 1;
            if ((r6 | 0) == 0) {
              r37 = r38;
              break L3479;
            } else {
              r34 = r38;
              r35 = r35 + 8 | 0;
              r36 = r6;
              r3 = 2674;
            }
          }
        }
      } while (0);
      if ((r11 | 0) > -1) {
        r13 = r32;
        r14 = r10 * r37;
        break;
      } else {
        r13 = r32;
        r14 = r10 / r37;
        break;
      }
    }
  } while (0);
  if ((r2 | 0) != 0) {
    HEAP32[r2 >> 2] = r13;
  }
  if ((r7 | 0) == 0) {
    r39 = r14;
    return r39;
  }
  r39 = -r14;
  return r39;
}
function _strtold(r1, r2) {
  return _strtod(r1, r2);
}
function _strtod_l(r1, r2, r3) {
  return _strtod(r1, r2);
}
function _strtold_l(r1, r2, r3) {
  return _strtold(r1, r2);
}
function _atof(r1) {
  return _strtod(r1, 0);
}
function __err(r1, r2, r3) {
  var r4, r5;
  r4 = STACKTOP;
  STACKTOP = STACKTOP + 4 | 0;
  r5 = r4;
  HEAP32[r5 >> 2] = r3;
  __verr(r1, r2, HEAP32[r5 >> 2]);
}
function __errx(r1, r2, r3) {
  var r4, r5;
  r4 = STACKTOP;
  STACKTOP = STACKTOP + 4 | 0;
  r5 = r4;
  HEAP32[r5 >> 2] = r3;
  __verrx(r1, r2, HEAP32[r5 >> 2]);
}
function __verr(r1, r2, r3) {
  var r4, r5;
  r4 = HEAP32[___errno_location() >> 2];
  r5 = HEAP32[___progname >> 2];
  _fprintf(HEAP32[_stderr >> 2], 411112, (tempInt = STACKTOP, STACKTOP = STACKTOP + 4 | 0, HEAP32[tempInt >> 2] = r5, tempInt));
  if ((r2 | 0) != 0) {
    _fprintf(HEAP32[_stderr >> 2], r2, r3);
    _fwrite(411344, 2, 1, HEAP32[_stderr >> 2]);
  }
  r3 = HEAP32[_stderr >> 2];
  r2 = _strerror(r4);
  _fprintf(r3, 411220, (tempInt = STACKTOP, STACKTOP = STACKTOP + 4 | 0, HEAP32[tempInt >> 2] = r2, tempInt));
  _exit(r1);
}
function __verrx(r1, r2, r3) {
  var r4;
  r4 = HEAP32[___progname >> 2];
  _fprintf(HEAP32[_stderr >> 2], 411272, (tempInt = STACKTOP, STACKTOP = STACKTOP + 4 | 0, HEAP32[tempInt >> 2] = r4, tempInt));
  if ((r2 | 0) != 0) {
    _fprintf(HEAP32[_stderr >> 2], r2, r3);
  }
  _fputc(10, HEAP32[_stderr >> 2]);
  _exit(r1);
}
// EMSCRIPTEN_END_FUNCS
Module["_jsapi_event_get_type"] = _jsapi_event_get_type;
Module["_jsapi_event_get_peer"] = _jsapi_event_get_peer;
Module["_jsapi_event_get_channelID"] = _jsapi_event_get_channelID;
Module["_jsapi_event_get_packet"] = _jsapi_event_get_packet;
Module["_jsapi_event_get_data"] = _jsapi_event_get_data;
Module["_jsapi_address_get_host"] = _jsapi_address_get_host;
Module["_jsapi_address_get_port"] = _jsapi_address_get_port;
Module["_jsapi_packet_get_data"] = _jsapi_packet_get_data;
Module["_jsapi_packet_get_dataLength"] = _jsapi_packet_get_dataLength;
Module["_jsapi_host_get_receivedAddress"] = _jsapi_host_get_receivedAddress;
Module["_jsapi_host_get_socket"] = _jsapi_host_get_socket;
Module["_jsapi_peer_get_address"] = _jsapi_peer_get_address;
Module["_jsapi_enet_host_create"] = _jsapi_enet_host_create;
Module["_jsapi_enet_host_connect"] = _jsapi_enet_host_connect;
Module["_jsapi_event_new"] = _jsapi_event_new;
Module["_jsapi_event_free"] = _jsapi_event_free;
Module["_enet_host_destroy"] = _enet_host_destroy;
Module["_enet_packet_create"] = _enet_packet_create;
Module["_enet_packet_destroy"] = _enet_packet_destroy;
Module["_enet_peer_send"] = _enet_peer_send;
Module["_enet_peer_reset"] = _enet_peer_reset;
Module["_enet_peer_ping"] = _enet_peer_ping;
Module["_enet_peer_disconnect_now"] = _enet_peer_disconnect_now;
Module["_enet_peer_disconnect"] = _enet_peer_disconnect;
Module["_enet_peer_disconnect_later"] = _enet_peer_disconnect_later;
Module["_enet_host_service"] = _enet_host_service;
Module["_calloc"] = _calloc;
Module["_realloc"] = _realloc;
// Warning: printing of i64 values may be slightly rounded! No deep i64 math used, so precise i64 code not included
var i64Math = null;
// === Auto-generated postamble setup entry stuff ===
Module.callMain = function callMain(args) {
  var argc = args.length+1;
  function pad() {
    for (var i = 0; i < 4-1; i++) {
      argv.push(0);
    }
  }
  var argv = [allocate(intArrayFromString("/bin/this.program"), 'i8', ALLOC_STATIC) ];
  pad();
  for (var i = 0; i < argc-1; i = i + 1) {
    argv.push(allocate(intArrayFromString(args[i]), 'i8', ALLOC_STATIC));
    pad();
  }
  argv.push(0);
  argv = allocate(argv, 'i32', ALLOC_STATIC);
  var ret;
  var initialStackTop = STACKTOP;
  try {
    ret = Module['_main'](argc, argv, 0);
  }
  catch(e) {
    if (e.name == 'ExitStatus') {
      return e.status;
    } else if (e == 'SimulateInfiniteLoop') {
      Module['noExitRuntime'] = true;
    } else {
      throw e;
    }
  } finally {
    STACKTOP = initialStackTop;
  }
  return ret;
}
function run(args) {
  args = args || Module['arguments'];
  if (runDependencies > 0) {
    Module.printErr('run() called, but dependencies remain, so not running');
    return 0;
  }
  if (Module['preRun']) {
    if (typeof Module['preRun'] == 'function') Module['preRun'] = [Module['preRun']];
    var toRun = Module['preRun'];
    Module['preRun'] = [];
    for (var i = toRun.length-1; i >= 0; i--) {
      toRun[i]();
    }
    if (runDependencies > 0) {
      // a preRun added a dependency, run will be called later
      return 0;
    }
  }
  function doRun() {
    var ret = 0;
    calledRun = true;
    if (Module['_main']) {
      preMain();
      ret = Module.callMain(args);
      if (!Module['noExitRuntime']) {
        exitRuntime();
      }
    }
    if (Module['postRun']) {
      if (typeof Module['postRun'] == 'function') Module['postRun'] = [Module['postRun']];
      while (Module['postRun'].length > 0) {
        Module['postRun'].pop()();
      }
    }
    return ret;
  }
  if (Module['setStatus']) {
    Module['setStatus']('Running...');
    setTimeout(function() {
      setTimeout(function() {
        Module['setStatus']('');
      }, 1);
      doRun();
    }, 1);
    return 0;
  } else {
    return doRun();
  }
}
Module['run'] = Module.run = run;
// {{PRE_RUN_ADDITIONS}}
if (Module['preInit']) {
  if (typeof Module['preInit'] == 'function') Module['preInit'] = [Module['preInit']];
  while (Module['preInit'].length > 0) {
    Module['preInit'].pop()();
  }
}
initRuntime();
var shouldRunNow = true;
if (Module['noInitialRun']) {
  shouldRunNow = false;
}
if (shouldRunNow) {
  run();
}
// {{POST_RUN_ADDITIONS}}
  // {{MODULE_ADDITIONS}}
var events, util, Queue, DGRAM;
var ENET_HOST_SERVICE_INTERVAL = 30;//milli-seconds
var global_packet_filter;
events = require("events");
util = require("util");
DGRAM = require("dgram");
module.exports.init = function( pf_func){
    if(pf_func){
        _jsapi_init(1);
        global_packet_filter = pf_func;
    }else{
        _jsapi_init(0);
    }
};
module.exports.Host = ENetHost;
module.exports.Address = ENetAddress;
module.exports.Packet = ENetPacket;
module.exports.inet_ip2long=ip2long;
module.exports.inet_long2ip=long2ip;
if(events && util ) util.inherits(ENetHost, events.EventEmitter);
function ENetHost(address,maxchannels,maxpeers){
   if(events){
      events.EventEmitter.call(this);
   }else{
       this._events = {};
   }
   var self = this;
   var pointer = ccall('jsapi_enet_host_create', 'number', 
			['number','number','number','number','number','number'],
			[address.host(), address.port(),maxpeers || 128, maxchannels || 5, 0, 0]);
   if(pointer==0){
	throw('failed to create ENet host');
   }
   self._event = new ENetEvent();//allocate memory for - free it when we destroy the host
   self._pointer = pointer;
   self._socket_bound = false;
}
if(!events){
    ENetHost.prototype.on = function(e,cb){
        this._events[e] ? this._events[e].push(cb) : this._events[e]=[cb];
    };
    ENetHost.prototype.emit = function(){
        //used internally to fire events
        //'apply' event handler function  to 'this' channel pass eventname and Object O
        var self = this;
        var e = arguments[0];
        var params = Array.prototype.slice.apply(arguments,[1]);
        if(this._events && this._events[e]){
            this._events[e].forEach(function(cb){
                cb.apply(self,params);
            });
        }
    };
}
ENetHost.prototype.__service = cwrap('enet_host_service','number',['number','number','number']);
ENetHost.prototype.service = function(){
   var self = this;
   if(!self._pointer || !self._event) return;
  try{
	if(!self._socket_bound){
                //keep checking until the port is non 0
                if(self.address().port()!=0){
                    self._socket_bound=true;
                    self.emit('ready');
                }
         }
   var err = self.__service(self._pointer,self._event._pointer,0);
   while( err > 0){
	switch(self._event.type()){
		case 0:	//none
			break;
		case 1: //connect
			self.emit("connect",
			  self._event.peer(),
			  self._event.data()
			);
			break;			
		case 2: //disconnect
			self.emit("disconnect",
			  self._event.peer(),
			  self._event.data()
			);
			break;
		case 3: //receive
			self.emit("message",
			  self._event.peer(),
			  self._event.packet(),
			  self._event.channelID(),
			  self._event.data()
			);
			self._event.packet().destroy();
			break;
		case 100: //rawpacket
			try{
			JSON.parse(self._event.packet().data().toString());
			self.emit("telex",
			  self._event.packet().data(),{
			    'address':self.receivedAddress().address(),
			    'port':self.receivedAddress().port()
 			  }
			);
			}catch(E){}
			self._event.packet().destroy();
			break;
	}
	err = self.__service(self._pointer,self._event._pointer,0);
   }
  }catch(e){
   //console.log(e);
   if(err < 0) console.error("error servicing host: ",err);
  }
};
ENetHost.prototype.destroy = function(){
   var self = this;
   self.stop();
   self._event.free();
   ccall("enet_host_destroy",'',['number'],[this._pointer]);
   delete self._pointer;
   delete self._event;
};
ENetHost.prototype.receivedAddress = function(){
	var ptr = ccall("jsapi_host_get_receivedAddress",'number',['number'],[this._pointer]);
	return new ENetAddress(ptr);
};
ENetHost.prototype.address = function(){
	//get node udp dgram.address()
	var socket = ccall('jsapi_host_get_socket',"number",['number'],[this._pointer]);
	var addr = udp_sockets[socket].address();
	return new ENetAddress(addr.address,addr.port);
};
ENetHost.prototype.send = function(ip, port,buff){
	var socket = ccall('jsapi_host_get_socket',"number",['number'],[this._pointer]);
	udp_sockets[socket].send(buff,0,buff.length,port,ip);
};
ENetHost.prototype.connect = function(address,channelCount,data){
	var ptr=ccall("jsapi_enet_host_connect","number",['number','number','number','number','number'],
		[this._pointer,address.host(),address.port(),channelCount||5,data||0]);
	return new ENetPeer(ptr);
};
ENetHost.prototype.start_watcher = function(){
   if(this._io_loop) return;
   var self=this;
   self._io_loop = setInterval(function(){
	self.service();
   },ENET_HOST_SERVICE_INTERVAL);
};
ENetHost.prototype.stop_watcher = function(){
  if(this._io_loop){
	clearInterval(this._io_loop);	
  }
};
ENetHost.prototype.start = ENetHost.prototype.start_watcher;
ENetHost.prototype.stop = ENetHost.prototype.stop_watcher;
function ENetPacket(pointer){
  if(arguments.length==1 && typeof arguments[0]=='number'){
	this._pointer = arguments[0];
	//console.log("Wrapping ENetPacket Pointer", this._pointer);
	return this;
  }
  if(arguments.length>0 && typeof arguments[0]=='object'){
	//construct a new packet from node buffer
	var buf = arguments[0];
	var flags = arguments[1] || 0;
	this._pointer = ccall("enet_packet_create","number",['number','number','number'],[0,buf.length,flags]);
	//console.log("ENetPacket malloc'ed",this._pointer);
        var begin = ccall("jsapi_packet_get_data","number",["number"],[this._pointer]);
        var end = begin + buf.length;
	var c=0,i=begin;
	for(;i<end;i++,c++){
		HEAPU8[i]=buf.readUInt8(c);
	}
	return this;
  }
  if(arguments.length>0 && typeof arguments[0]=='string'){
	return new ENetPacket( new Buffer(arguments[0]), arguments[1]||0);
  }
};
ENetPacket.prototype.data = function(){
	var begin = ccall("jsapi_packet_get_data","number",["number"],[this._pointer]);
	var end = begin + ccall("jsapi_packet_get_dataLength","number",["number"],[this._pointer]);
	return new Buffer(HEAPU8.subarray(begin,end),"byte");
	//return HEAPU8.subarray(begin,end);
};
ENetPacket.prototype.dataLength = function(){
	return ccall("jsapi_packet_get_dataLength","number",["number"],[this._pointer]);
};
ENetPacket.prototype.destroy = function(){
	ccall("enet_packet_destroy",'',['number'],[this._pointer]);
};
ENetPacket.prototype.FLAG_RELIABLE = 1;
function ENetEvent(){
   this._pointer = ccall('jsapi_event_new','number');
};
ENetEvent.prototype.free = function(){
   ccall('jsapi_event_free','',['number'],[this._pointer]);
};
ENetEvent.prototype.type = function(){
   return ccall('jsapi_event_get_type','number',['number'],[this._pointer]);
};
ENetEvent.prototype.peer = function(){
   var ptr = ccall('jsapi_event_get_peer','number',['number'],[this._pointer]);
   return new ENetPeer(ptr);
};
ENetEvent.prototype.packet = function(){
   var ptr = ccall('jsapi_event_get_packet','number',['number'],[this._pointer]);
   return new ENetPacket(ptr);
};
ENetEvent.prototype.data = function(){
  return ccall('jsapi_event_get_data','number',['number'],[this._pointer]);
};
ENetEvent.prototype.channelID = function(){
 return ccall('jsapi_event_get_channelID','number',['number'],[this._pointer]);
};
function ENetAddress(){
   if(arguments.length==1 && typeof arguments[0]=='object'){
	this._host = arguments[0].host();
	this._port = arguments[0].port();
	return this;
   }
   if(arguments.length==1 && typeof arguments[0]=='number'){
	this._pointer = arguments[0];
	return this;
   }
   if(arguments.length==1 && typeof arguments[0]=='string'){
	var ipp =arguments[0].split(':');
	this._host = ip2long(ipp[0]);
	this._port = ipp[1]||0;
	return this;
   }
   if(arguments.length==2){
	if(typeof arguments[0] == 'string'){
		this._host = ip2long((arguments[0]));
	}else{
		this._host = arguments[0];
	}
	this._port = arguments[1];
	return this;
   }
   throw("bad parameters creating ENetAddress");
};
ENetAddress.prototype.host = function(){
  if(this._pointer){
	var hostptr = ccall('jsapi_address_get_host','number',['number'],[this._pointer]);
	return HEAPU32[hostptr>>2];
  }else{
	return this._host;
  }
};
ENetAddress.prototype.port = function(){
  if(this._pointer){
    return ccall('jsapi_address_get_port','number',['number'],[this._pointer]);
  }else{
    return this._port;
  }
};
ENetAddress.prototype.address = function(){ 
  if(this._pointer) return long2ip(this.host(),'ENetAddress.prototype.address from pointer');
  return long2ip(this.host(),'ENetAddress.prototype.address from local');
}
function ENetPeer(pointer){
  if(pointer) this._pointer = pointer; else throw("improper use of ENetPeer");
};
ENetPeer.prototype.send = function(channel,packet){
	var ret = ccall('enet_peer_send','number',['number','number','number'],[this._pointer,channel,packet._pointer]);
	if(ret < 0) throw("enet.Peer send error");
	//console.log("enet_peer_send return value:",ret);
};
ENetPeer.prototype.receive = function(){
};
ENetPeer.prototype.reset = function(){
  ccall('enet_peer_reset','',['number'],[this._pointer]);
};
ENetPeer.prototype.ping = function(){
  ccall('enet_peer_ping','',['number'],[this._pointer]);
};
ENetPeer.prototype.disconnect = function(data){
  ccall('enet_peer_disconnect','',['number','number'],[this._pointer, data||0]);
};
ENetPeer.prototype.disconnectNow = function(data){
  ccall('enet_peer_disconnect_now','',['number','number'],[this._pointer,data||0]);
};
ENetPeer.prototype.disconnectLater = function(data){
  ccall('enet_peer_disconnect_later','',['number','number'],[this._pointer,data||0]);
};
ENetPeer.prototype.address = function(){
 var ptr = ccall('jsapi_peer_get_address','number',['number'],[this._pointer]);
 return new ENetAddress(ptr);
};
function __packet_filter (host_ptr){
   var ip,port,data;
   return global_packet_filter(ip,port,data);
}
/*
    Queue.js - Created by Stephen Morley 
    http://code.stephenmorley.org/ - released under the terms of
    the CC0 1.0 Universal legal code:
    http://creativecommons.org/publicdomain/zero/1.0/legalcode
*/
/* Creates a new queue. A queue is a first-in-first-out (FIFO) data structure -
 * items are added to the end of the queue and removed from the front.
 */
function Queue(){
  // initialise the queue and offset
  var queue  = [];
  var offset = 0;
  /* Returns the length of the queue.
   */
  this.getLength = function(){
    // return the length of the queue
    return (queue.length - offset);
  }
  /* Returns true if the queue is empty, and false otherwise.
   */
  this.isEmpty = function(){
    // return whether the queue is empty
    return (queue.length == 0);
  }
  /* Enqueues the specified item. The parameter is:
   *
   * item - the item to enqueue
   */
  this.enqueue = function(item){
    // enqueue the item
    queue.push(item);
  }
  /* Dequeues an item and returns it. If the queue is empty then undefined is
   * returned.
   */
  this.dequeue = function(){
    // if the queue is empty, return undefined
    if (queue.length == 0) return undefined;
    // store the item at the front of the queue
    var item = queue[offset];
    // increment the offset and remove the free space if necessary
    if (++ offset * 2 >= queue.length){
      queue  = queue.slice(offset);
      offset = 0;
    }
    // return the dequeued item
    return item;
  }
  /* Returns the item at the front of the queue (without dequeuing it). If the
   * queue is empty then undefined is returned.
   */
  this.peek = function(){
    // return the item at the front of the queue
    return (queue.length > 0 ? queue[offset] : undefined);
  }
}

});

require.define("buffer",function(require,module,exports,__dirname,__filename,process,global){module.exports = require("buffer-browserify")
});

require.define("/node_modules/buffer-browserify/package.json",function(require,module,exports,__dirname,__filename,process,global){module.exports = {"main":"index.js","browserify":"index.js"}
});

require.define("/node_modules/buffer-browserify/index.js",function(require,module,exports,__dirname,__filename,process,global){function SlowBuffer (size) {
    this.length = size;
};

var assert = require('assert');

exports.INSPECT_MAX_BYTES = 50;


function toHex(n) {
  if (n < 16) return '0' + n.toString(16);
  return n.toString(16);
}

function utf8ToBytes(str) {
  var byteArray = [];
  for (var i = 0; i < str.length; i++)
    if (str.charCodeAt(i) <= 0x7F)
      byteArray.push(str.charCodeAt(i));
    else {
      var h = encodeURIComponent(str.charAt(i)).substr(1).split('%');
      for (var j = 0; j < h.length; j++)
        byteArray.push(parseInt(h[j], 16));
    }

  return byteArray;
}

function asciiToBytes(str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++ )
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push( str.charCodeAt(i) & 0xFF );

  return byteArray;
}

function base64ToBytes(str) {
  return require("base64-js").toByteArray(str);
}

SlowBuffer.byteLength = function (str, encoding) {
  switch (encoding || "utf8") {
    case 'hex':
      return str.length / 2;

    case 'utf8':
    case 'utf-8':
      return utf8ToBytes(str).length;

    case 'ascii':
    case 'binary':
      return str.length;

    case 'base64':
      return base64ToBytes(str).length;

    default:
      throw new Error('Unknown encoding');
  }
};

function blitBuffer(src, dst, offset, length) {
  var pos, i = 0;
  while (i < length) {
    if ((i+offset >= dst.length) || (i >= src.length))
      break;

    dst[i + offset] = src[i];
    i++;
  }
  return i;
}

SlowBuffer.prototype.utf8Write = function (string, offset, length) {
  var bytes, pos;
  return SlowBuffer._charsWritten =  blitBuffer(utf8ToBytes(string), this, offset, length);
};

SlowBuffer.prototype.asciiWrite = function (string, offset, length) {
  var bytes, pos;
  return SlowBuffer._charsWritten =  blitBuffer(asciiToBytes(string), this, offset, length);
};

SlowBuffer.prototype.binaryWrite = SlowBuffer.prototype.asciiWrite;

SlowBuffer.prototype.base64Write = function (string, offset, length) {
  var bytes, pos;
  return SlowBuffer._charsWritten = blitBuffer(base64ToBytes(string), this, offset, length);
};

SlowBuffer.prototype.base64Slice = function (start, end) {
  var bytes = Array.prototype.slice.apply(this, arguments)
  return require("base64-js").fromByteArray(bytes);
}

function decodeUtf8Char(str) {
  try {
    return decodeURIComponent(str);
  } catch (err) {
    return String.fromCharCode(0xFFFD); // UTF 8 invalid char
  }
}

SlowBuffer.prototype.utf8Slice = function () {
  var bytes = Array.prototype.slice.apply(this, arguments);
  var res = "";
  var tmp = "";
  var i = 0;
  while (i < bytes.length) {
    if (bytes[i] <= 0x7F) {
      res += decodeUtf8Char(tmp) + String.fromCharCode(bytes[i]);
      tmp = "";
    } else
      tmp += "%" + bytes[i].toString(16);

    i++;
  }

  return res + decodeUtf8Char(tmp);
}

SlowBuffer.prototype.asciiSlice = function () {
  var bytes = Array.prototype.slice.apply(this, arguments);
  var ret = "";
  for (var i = 0; i < bytes.length; i++)
    ret += String.fromCharCode(bytes[i]);
  return ret;
}

SlowBuffer.prototype.binarySlice = SlowBuffer.prototype.asciiSlice;

SlowBuffer.prototype.inspect = function() {
  var out = [],
      len = this.length;
  for (var i = 0; i < len; i++) {
    out[i] = toHex(this[i]);
    if (i == exports.INSPECT_MAX_BYTES) {
      out[i + 1] = '...';
      break;
    }
  }
  return '<SlowBuffer ' + out.join(' ') + '>';
};


SlowBuffer.prototype.hexSlice = function(start, end) {
  var len = this.length;

  if (!start || start < 0) start = 0;
  if (!end || end < 0 || end > len) end = len;

  var out = '';
  for (var i = start; i < end; i++) {
    out += toHex(this[i]);
  }
  return out;
};


SlowBuffer.prototype.toString = function(encoding, start, end) {
  encoding = String(encoding || 'utf8').toLowerCase();
  start = +start || 0;
  if (typeof end == 'undefined') end = this.length;

  // Fastpath empty strings
  if (+end == start) {
    return '';
  }

  switch (encoding) {
    case 'hex':
      return this.hexSlice(start, end);

    case 'utf8':
    case 'utf-8':
      return this.utf8Slice(start, end);

    case 'ascii':
      return this.asciiSlice(start, end);

    case 'binary':
      return this.binarySlice(start, end);

    case 'base64':
      return this.base64Slice(start, end);

    case 'ucs2':
    case 'ucs-2':
      return this.ucs2Slice(start, end);

    default:
      throw new Error('Unknown encoding');
  }
};


SlowBuffer.prototype.hexWrite = function(string, offset, length) {
  offset = +offset || 0;
  var remaining = this.length - offset;
  if (!length) {
    length = remaining;
  } else {
    length = +length;
    if (length > remaining) {
      length = remaining;
    }
  }

  // must be an even number of digits
  var strLen = string.length;
  if (strLen % 2) {
    throw new Error('Invalid hex string');
  }
  if (length > strLen / 2) {
    length = strLen / 2;
  }
  for (var i = 0; i < length; i++) {
    var byte = parseInt(string.substr(i * 2, 2), 16);
    if (isNaN(byte)) throw new Error('Invalid hex string');
    this[offset + i] = byte;
  }
  SlowBuffer._charsWritten = i * 2;
  return i;
};


SlowBuffer.prototype.write = function(string, offset, length, encoding) {
  // Support both (string, offset, length, encoding)
  // and the legacy (string, encoding, offset, length)
  if (isFinite(offset)) {
    if (!isFinite(length)) {
      encoding = length;
      length = undefined;
    }
  } else {  // legacy
    var swap = encoding;
    encoding = offset;
    offset = length;
    length = swap;
  }

  offset = +offset || 0;
  var remaining = this.length - offset;
  if (!length) {
    length = remaining;
  } else {
    length = +length;
    if (length > remaining) {
      length = remaining;
    }
  }
  encoding = String(encoding || 'utf8').toLowerCase();

  switch (encoding) {
    case 'hex':
      return this.hexWrite(string, offset, length);

    case 'utf8':
    case 'utf-8':
      return this.utf8Write(string, offset, length);

    case 'ascii':
      return this.asciiWrite(string, offset, length);

    case 'binary':
      return this.binaryWrite(string, offset, length);

    case 'base64':
      return this.base64Write(string, offset, length);

    case 'ucs2':
    case 'ucs-2':
      return this.ucs2Write(string, offset, length);

    default:
      throw new Error('Unknown encoding');
  }
};


// slice(start, end)
SlowBuffer.prototype.slice = function(start, end) {
  if (end === undefined) end = this.length;

  if (end > this.length) {
    throw new Error('oob');
  }
  if (start > end) {
    throw new Error('oob');
  }

  return new Buffer(this, end - start, +start);
};

SlowBuffer.prototype.copy = function(target, targetstart, sourcestart, sourceend) {
  var temp = [];
  for (var i=sourcestart; i<sourceend; i++) {
    assert.ok(typeof this[i] !== 'undefined', "copying undefined buffer bytes!");
    temp.push(this[i]);
  }

  for (var i=targetstart; i<targetstart+temp.length; i++) {
    target[i] = temp[i-targetstart];
  }
};

SlowBuffer.prototype.fill = function(value, start, end) {
  if (end > this.length) {
    throw new Error('oob');
  }
  if (start > end) {
    throw new Error('oob');
  }

  for (var i = start; i < end; i++) {
    this[i] = value;
  }
}

function coerce(length) {
  // Coerce length to a number (possibly NaN), round up
  // in case it's fractional (e.g. 123.456) then do a
  // double negate to coerce a NaN to 0. Easy, right?
  length = ~~Math.ceil(+length);
  return length < 0 ? 0 : length;
}


// Buffer

function Buffer(subject, encoding, offset) {
  if (!(this instanceof Buffer)) {
    return new Buffer(subject, encoding, offset);
  }

  var type;

  // Are we slicing?
  if (typeof offset === 'number') {
    this.length = coerce(encoding);
    this.parent = subject;
    this.offset = offset;
  } else {
    // Find the length
    switch (type = typeof subject) {
      case 'number':
        this.length = coerce(subject);
        break;

      case 'string':
        this.length = Buffer.byteLength(subject, encoding);
        break;

      case 'object': // Assume object is an array
        this.length = coerce(subject.length);
        break;

      default:
        throw new Error('First argument needs to be a number, ' +
                        'array or string.');
    }

    if (this.length > Buffer.poolSize) {
      // Big buffer, just alloc one.
      this.parent = new SlowBuffer(this.length);
      this.offset = 0;

    } else {
      // Small buffer.
      if (!pool || pool.length - pool.used < this.length) allocPool();
      this.parent = pool;
      this.offset = pool.used;
      pool.used += this.length;
    }

    // Treat array-ish objects as a byte array.
    if (isArrayIsh(subject)) {
      for (var i = 0; i < this.length; i++) {
        if (subject instanceof Buffer) {
          this.parent[i + this.offset] = subject.readUInt8(i);
        }
        else {
          this.parent[i + this.offset] = subject[i];
        }
      }
    } else if (type == 'string') {
      // We are a string
      this.length = this.write(subject, 0, encoding);
    }
  }

}

function isArrayIsh(subject) {
  return Array.isArray(subject) || Buffer.isBuffer(subject) ||
         subject && typeof subject === 'object' &&
         typeof subject.length === 'number';
}

exports.SlowBuffer = SlowBuffer;
exports.Buffer = Buffer;

Buffer.poolSize = 8 * 1024;
var pool;

function allocPool() {
  pool = new SlowBuffer(Buffer.poolSize);
  pool.used = 0;
}


// Static methods
Buffer.isBuffer = function isBuffer(b) {
  return b instanceof Buffer || b instanceof SlowBuffer;
};

Buffer.concat = function (list, totalLength) {
  if (!Array.isArray(list)) {
    throw new Error("Usage: Buffer.concat(list, [totalLength])\n \
      list should be an Array.");
  }

  if (list.length === 0) {
    return new Buffer(0);
  } else if (list.length === 1) {
    return list[0];
  }

  if (typeof totalLength !== 'number') {
    totalLength = 0;
    for (var i = 0; i < list.length; i++) {
      var buf = list[i];
      totalLength += buf.length;
    }
  }

  var buffer = new Buffer(totalLength);
  var pos = 0;
  for (var i = 0; i < list.length; i++) {
    var buf = list[i];
    buf.copy(buffer, pos);
    pos += buf.length;
  }
  return buffer;
};

// Inspect
Buffer.prototype.inspect = function inspect() {
  var out = [],
      len = this.length;

  for (var i = 0; i < len; i++) {
    out[i] = toHex(this.parent[i + this.offset]);
    if (i == exports.INSPECT_MAX_BYTES) {
      out[i + 1] = '...';
      break;
    }
  }

  return '<Buffer ' + out.join(' ') + '>';
};


Buffer.prototype.get = function get(i) {
  if (i < 0 || i >= this.length) throw new Error('oob');
  return this.parent[this.offset + i];
};


Buffer.prototype.set = function set(i, v) {
  if (i < 0 || i >= this.length) throw new Error('oob');
  return this.parent[this.offset + i] = v;
};


// write(string, offset = 0, length = buffer.length-offset, encoding = 'utf8')
Buffer.prototype.write = function(string, offset, length, encoding) {
  // Support both (string, offset, length, encoding)
  // and the legacy (string, encoding, offset, length)
  if (isFinite(offset)) {
    if (!isFinite(length)) {
      encoding = length;
      length = undefined;
    }
  } else {  // legacy
    var swap = encoding;
    encoding = offset;
    offset = length;
    length = swap;
  }

  offset = +offset || 0;
  var remaining = this.length - offset;
  if (!length) {
    length = remaining;
  } else {
    length = +length;
    if (length > remaining) {
      length = remaining;
    }
  }
  encoding = String(encoding || 'utf8').toLowerCase();

  var ret;
  switch (encoding) {
    case 'hex':
      ret = this.parent.hexWrite(string, this.offset + offset, length);
      break;

    case 'utf8':
    case 'utf-8':
      ret = this.parent.utf8Write(string, this.offset + offset, length);
      break;

    case 'ascii':
      ret = this.parent.asciiWrite(string, this.offset + offset, length);
      break;

    case 'binary':
      ret = this.parent.binaryWrite(string, this.offset + offset, length);
      break;

    case 'base64':
      // Warning: maxLength not taken into account in base64Write
      ret = this.parent.base64Write(string, this.offset + offset, length);
      break;

    case 'ucs2':
    case 'ucs-2':
      ret = this.parent.ucs2Write(string, this.offset + offset, length);
      break;

    default:
      throw new Error('Unknown encoding');
  }

  Buffer._charsWritten = SlowBuffer._charsWritten;

  return ret;
};


// toString(encoding, start=0, end=buffer.length)
Buffer.prototype.toString = function(encoding, start, end) {
  encoding = String(encoding || 'utf8').toLowerCase();

  if (typeof start == 'undefined' || start < 0) {
    start = 0;
  } else if (start > this.length) {
    start = this.length;
  }

  if (typeof end == 'undefined' || end > this.length) {
    end = this.length;
  } else if (end < 0) {
    end = 0;
  }

  start = start + this.offset;
  end = end + this.offset;

  switch (encoding) {
    case 'hex':
      return this.parent.hexSlice(start, end);

    case 'utf8':
    case 'utf-8':
      return this.parent.utf8Slice(start, end);

    case 'ascii':
      return this.parent.asciiSlice(start, end);

    case 'binary':
      return this.parent.binarySlice(start, end);

    case 'base64':
      return this.parent.base64Slice(start, end);

    case 'ucs2':
    case 'ucs-2':
      return this.parent.ucs2Slice(start, end);

    default:
      throw new Error('Unknown encoding');
  }
};


// byteLength
Buffer.byteLength = SlowBuffer.byteLength;


// fill(value, start=0, end=buffer.length)
Buffer.prototype.fill = function fill(value, start, end) {
  value || (value = 0);
  start || (start = 0);
  end || (end = this.length);

  if (typeof value === 'string') {
    value = value.charCodeAt(0);
  }
  if (!(typeof value === 'number') || isNaN(value)) {
    throw new Error('value is not a number');
  }

  if (end < start) throw new Error('end < start');

  // Fill 0 bytes; we're done
  if (end === start) return 0;
  if (this.length == 0) return 0;

  if (start < 0 || start >= this.length) {
    throw new Error('start out of bounds');
  }

  if (end < 0 || end > this.length) {
    throw new Error('end out of bounds');
  }

  return this.parent.fill(value,
                          start + this.offset,
                          end + this.offset);
};


// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function(target, target_start, start, end) {
  var source = this;
  start || (start = 0);
  end || (end = this.length);
  target_start || (target_start = 0);

  if (end < start) throw new Error('sourceEnd < sourceStart');

  // Copy 0 bytes; we're done
  if (end === start) return 0;
  if (target.length == 0 || source.length == 0) return 0;

  if (target_start < 0 || target_start >= target.length) {
    throw new Error('targetStart out of bounds');
  }

  if (start < 0 || start >= source.length) {
    throw new Error('sourceStart out of bounds');
  }

  if (end < 0 || end > source.length) {
    throw new Error('sourceEnd out of bounds');
  }

  // Are we oob?
  if (end > this.length) {
    end = this.length;
  }

  if (target.length - target_start < end - start) {
    end = target.length - target_start + start;
  }

  return this.parent.copy(target.parent,
                          target_start + target.offset,
                          start + this.offset,
                          end + this.offset);
};


// slice(start, end)
Buffer.prototype.slice = function(start, end) {
  if (end === undefined) end = this.length;
  if (end > this.length) throw new Error('oob');
  if (start > end) throw new Error('oob');

  return new Buffer(this.parent, end - start, +start + this.offset);
};


// Legacy methods for backwards compatibility.

Buffer.prototype.utf8Slice = function(start, end) {
  return this.toString('utf8', start, end);
};

Buffer.prototype.binarySlice = function(start, end) {
  return this.toString('binary', start, end);
};

Buffer.prototype.asciiSlice = function(start, end) {
  return this.toString('ascii', start, end);
};

Buffer.prototype.utf8Write = function(string, offset) {
  return this.write(string, offset, 'utf8');
};

Buffer.prototype.binaryWrite = function(string, offset) {
  return this.write(string, offset, 'binary');
};

Buffer.prototype.asciiWrite = function(string, offset) {
  return this.write(string, offset, 'ascii');
};

Buffer.prototype.readUInt8 = function(offset, noAssert) {
  var buffer = this;

  if (!noAssert) {
    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset < buffer.length,
        'Trying to read beyond buffer length');
  }

  if (offset >= buffer.length) return;

  return buffer.parent[buffer.offset + offset];
};

function readUInt16(buffer, offset, isBigEndian, noAssert) {
  var val = 0;


  if (!noAssert) {
    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 1 < buffer.length,
        'Trying to read beyond buffer length');
  }

  if (offset >= buffer.length) return 0;

  if (isBigEndian) {
    val = buffer.parent[buffer.offset + offset] << 8;
    if (offset + 1 < buffer.length) {
      val |= buffer.parent[buffer.offset + offset + 1];
    }
  } else {
    val = buffer.parent[buffer.offset + offset];
    if (offset + 1 < buffer.length) {
      val |= buffer.parent[buffer.offset + offset + 1] << 8;
    }
  }

  return val;
}

Buffer.prototype.readUInt16LE = function(offset, noAssert) {
  return readUInt16(this, offset, false, noAssert);
};

Buffer.prototype.readUInt16BE = function(offset, noAssert) {
  return readUInt16(this, offset, true, noAssert);
};

function readUInt32(buffer, offset, isBigEndian, noAssert) {
  var val = 0;

  if (!noAssert) {
    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 3 < buffer.length,
        'Trying to read beyond buffer length');
  }

  if (offset >= buffer.length) return 0;

  if (isBigEndian) {
    if (offset + 1 < buffer.length)
      val = buffer.parent[buffer.offset + offset + 1] << 16;
    if (offset + 2 < buffer.length)
      val |= buffer.parent[buffer.offset + offset + 2] << 8;
    if (offset + 3 < buffer.length)
      val |= buffer.parent[buffer.offset + offset + 3];
    val = val + (buffer.parent[buffer.offset + offset] << 24 >>> 0);
  } else {
    if (offset + 2 < buffer.length)
      val = buffer.parent[buffer.offset + offset + 2] << 16;
    if (offset + 1 < buffer.length)
      val |= buffer.parent[buffer.offset + offset + 1] << 8;
    val |= buffer.parent[buffer.offset + offset];
    if (offset + 3 < buffer.length)
      val = val + (buffer.parent[buffer.offset + offset + 3] << 24 >>> 0);
  }

  return val;
}

Buffer.prototype.readUInt32LE = function(offset, noAssert) {
  return readUInt32(this, offset, false, noAssert);
};

Buffer.prototype.readUInt32BE = function(offset, noAssert) {
  return readUInt32(this, offset, true, noAssert);
};


/*
 * Signed integer types, yay team! A reminder on how two's complement actually
 * works. The first bit is the signed bit, i.e. tells us whether or not the
 * number should be positive or negative. If the two's complement value is
 * positive, then we're done, as it's equivalent to the unsigned representation.
 *
 * Now if the number is positive, you're pretty much done, you can just leverage
 * the unsigned translations and return those. Unfortunately, negative numbers
 * aren't quite that straightforward.
 *
 * At first glance, one might be inclined to use the traditional formula to
 * translate binary numbers between the positive and negative values in two's
 * complement. (Though it doesn't quite work for the most negative value)
 * Mainly:
 *  - invert all the bits
 *  - add one to the result
 *
 * Of course, this doesn't quite work in Javascript. Take for example the value
 * of -128. This could be represented in 16 bits (big-endian) as 0xff80. But of
 * course, Javascript will do the following:
 *
 * > ~0xff80
 * -65409
 *
 * Whoh there, Javascript, that's not quite right. But wait, according to
 * Javascript that's perfectly correct. When Javascript ends up seeing the
 * constant 0xff80, it has no notion that it is actually a signed number. It
 * assumes that we've input the unsigned value 0xff80. Thus, when it does the
 * binary negation, it casts it into a signed value, (positive 0xff80). Then
 * when you perform binary negation on that, it turns it into a negative number.
 *
 * Instead, we're going to have to use the following general formula, that works
 * in a rather Javascript friendly way. I'm glad we don't support this kind of
 * weird numbering scheme in the kernel.
 *
 * (BIT-MAX - (unsigned)val + 1) * -1
 *
 * The astute observer, may think that this doesn't make sense for 8-bit numbers
 * (really it isn't necessary for them). However, when you get 16-bit numbers,
 * you do. Let's go back to our prior example and see how this will look:
 *
 * (0xffff - 0xff80 + 1) * -1
 * (0x007f + 1) * -1
 * (0x0080) * -1
 */
Buffer.prototype.readInt8 = function(offset, noAssert) {
  var buffer = this;
  var neg;

  if (!noAssert) {
    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset < buffer.length,
        'Trying to read beyond buffer length');
  }

  if (offset >= buffer.length) return;

  neg = buffer.parent[buffer.offset + offset] & 0x80;
  if (!neg) {
    return (buffer.parent[buffer.offset + offset]);
  }

  return ((0xff - buffer.parent[buffer.offset + offset] + 1) * -1);
};

function readInt16(buffer, offset, isBigEndian, noAssert) {
  var neg, val;

  if (!noAssert) {
    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 1 < buffer.length,
        'Trying to read beyond buffer length');
  }

  val = readUInt16(buffer, offset, isBigEndian, noAssert);
  neg = val & 0x8000;
  if (!neg) {
    return val;
  }

  return (0xffff - val + 1) * -1;
}

Buffer.prototype.readInt16LE = function(offset, noAssert) {
  return readInt16(this, offset, false, noAssert);
};

Buffer.prototype.readInt16BE = function(offset, noAssert) {
  return readInt16(this, offset, true, noAssert);
};

function readInt32(buffer, offset, isBigEndian, noAssert) {
  var neg, val;

  if (!noAssert) {
    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 3 < buffer.length,
        'Trying to read beyond buffer length');
  }

  val = readUInt32(buffer, offset, isBigEndian, noAssert);
  neg = val & 0x80000000;
  if (!neg) {
    return (val);
  }

  return (0xffffffff - val + 1) * -1;
}

Buffer.prototype.readInt32LE = function(offset, noAssert) {
  return readInt32(this, offset, false, noAssert);
};

Buffer.prototype.readInt32BE = function(offset, noAssert) {
  return readInt32(this, offset, true, noAssert);
};

function readFloat(buffer, offset, isBigEndian, noAssert) {
  if (!noAssert) {
    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset + 3 < buffer.length,
        'Trying to read beyond buffer length');
  }

  return require('./buffer_ieee754').readIEEE754(buffer, offset, isBigEndian,
      23, 4);
}

Buffer.prototype.readFloatLE = function(offset, noAssert) {
  return readFloat(this, offset, false, noAssert);
};

Buffer.prototype.readFloatBE = function(offset, noAssert) {
  return readFloat(this, offset, true, noAssert);
};

function readDouble(buffer, offset, isBigEndian, noAssert) {
  if (!noAssert) {
    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset + 7 < buffer.length,
        'Trying to read beyond buffer length');
  }

  return require('./buffer_ieee754').readIEEE754(buffer, offset, isBigEndian,
      52, 8);
}

Buffer.prototype.readDoubleLE = function(offset, noAssert) {
  return readDouble(this, offset, false, noAssert);
};

Buffer.prototype.readDoubleBE = function(offset, noAssert) {
  return readDouble(this, offset, true, noAssert);
};


/*
 * We have to make sure that the value is a valid integer. This means that it is
 * non-negative. It has no fractional component and that it does not exceed the
 * maximum allowed value.
 *
 *      value           The number to check for validity
 *
 *      max             The maximum value
 */
function verifuint(value, max) {
  assert.ok(typeof (value) == 'number',
      'cannot write a non-number as a number');

  assert.ok(value >= 0,
      'specified a negative value for writing an unsigned value');

  assert.ok(value <= max, 'value is larger than maximum value for type');

  assert.ok(Math.floor(value) === value, 'value has a fractional component');
}

Buffer.prototype.writeUInt8 = function(value, offset, noAssert) {
  var buffer = this;

  if (!noAssert) {
    assert.ok(value !== undefined && value !== null,
        'missing value');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset < buffer.length,
        'trying to write beyond buffer length');

    verifuint(value, 0xff);
  }

  if (offset < buffer.length) {
    buffer.parent[buffer.offset + offset] = value;
  }
};

function writeUInt16(buffer, value, offset, isBigEndian, noAssert) {
  if (!noAssert) {
    assert.ok(value !== undefined && value !== null,
        'missing value');

    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 1 < buffer.length,
        'trying to write beyond buffer length');

    verifuint(value, 0xffff);
  }

  for (var i = 0; i < Math.min(buffer.length - offset, 2); i++) {
    buffer.parent[buffer.offset + offset + i] =
        (value & (0xff << (8 * (isBigEndian ? 1 - i : i)))) >>>
            (isBigEndian ? 1 - i : i) * 8;
  }

}

Buffer.prototype.writeUInt16LE = function(value, offset, noAssert) {
  writeUInt16(this, value, offset, false, noAssert);
};

Buffer.prototype.writeUInt16BE = function(value, offset, noAssert) {
  writeUInt16(this, value, offset, true, noAssert);
};

function writeUInt32(buffer, value, offset, isBigEndian, noAssert) {
  if (!noAssert) {
    assert.ok(value !== undefined && value !== null,
        'missing value');

    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 3 < buffer.length,
        'trying to write beyond buffer length');

    verifuint(value, 0xffffffff);
  }

  for (var i = 0; i < Math.min(buffer.length - offset, 4); i++) {
    buffer.parent[buffer.offset + offset + i] =
        (value >>> (isBigEndian ? 3 - i : i) * 8) & 0xff;
  }
}

Buffer.prototype.writeUInt32LE = function(value, offset, noAssert) {
  writeUInt32(this, value, offset, false, noAssert);
};

Buffer.prototype.writeUInt32BE = function(value, offset, noAssert) {
  writeUInt32(this, value, offset, true, noAssert);
};


/*
 * We now move onto our friends in the signed number category. Unlike unsigned
 * numbers, we're going to have to worry a bit more about how we put values into
 * arrays. Since we are only worrying about signed 32-bit values, we're in
 * slightly better shape. Unfortunately, we really can't do our favorite binary
 * & in this system. It really seems to do the wrong thing. For example:
 *
 * > -32 & 0xff
 * 224
 *
 * What's happening above is really: 0xe0 & 0xff = 0xe0. However, the results of
 * this aren't treated as a signed number. Ultimately a bad thing.
 *
 * What we're going to want to do is basically create the unsigned equivalent of
 * our representation and pass that off to the wuint* functions. To do that
 * we're going to do the following:
 *
 *  - if the value is positive
 *      we can pass it directly off to the equivalent wuint
 *  - if the value is negative
 *      we do the following computation:
 *         mb + val + 1, where
 *         mb   is the maximum unsigned value in that byte size
 *         val  is the Javascript negative integer
 *
 *
 * As a concrete value, take -128. In signed 16 bits this would be 0xff80. If
 * you do out the computations:
 *
 * 0xffff - 128 + 1
 * 0xffff - 127
 * 0xff80
 *
 * You can then encode this value as the signed version. This is really rather
 * hacky, but it should work and get the job done which is our goal here.
 */

/*
 * A series of checks to make sure we actually have a signed 32-bit number
 */
function verifsint(value, max, min) {
  assert.ok(typeof (value) == 'number',
      'cannot write a non-number as a number');

  assert.ok(value <= max, 'value larger than maximum allowed value');

  assert.ok(value >= min, 'value smaller than minimum allowed value');

  assert.ok(Math.floor(value) === value, 'value has a fractional component');
}

function verifIEEE754(value, max, min) {
  assert.ok(typeof (value) == 'number',
      'cannot write a non-number as a number');

  assert.ok(value <= max, 'value larger than maximum allowed value');

  assert.ok(value >= min, 'value smaller than minimum allowed value');
}

Buffer.prototype.writeInt8 = function(value, offset, noAssert) {
  var buffer = this;

  if (!noAssert) {
    assert.ok(value !== undefined && value !== null,
        'missing value');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset < buffer.length,
        'Trying to write beyond buffer length');

    verifsint(value, 0x7f, -0x80);
  }

  if (value >= 0) {
    buffer.writeUInt8(value, offset, noAssert);
  } else {
    buffer.writeUInt8(0xff + value + 1, offset, noAssert);
  }
};

function writeInt16(buffer, value, offset, isBigEndian, noAssert) {
  if (!noAssert) {
    assert.ok(value !== undefined && value !== null,
        'missing value');

    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 1 < buffer.length,
        'Trying to write beyond buffer length');

    verifsint(value, 0x7fff, -0x8000);
  }

  if (value >= 0) {
    writeUInt16(buffer, value, offset, isBigEndian, noAssert);
  } else {
    writeUInt16(buffer, 0xffff + value + 1, offset, isBigEndian, noAssert);
  }
}

Buffer.prototype.writeInt16LE = function(value, offset, noAssert) {
  writeInt16(this, value, offset, false, noAssert);
};

Buffer.prototype.writeInt16BE = function(value, offset, noAssert) {
  writeInt16(this, value, offset, true, noAssert);
};

function writeInt32(buffer, value, offset, isBigEndian, noAssert) {
  if (!noAssert) {
    assert.ok(value !== undefined && value !== null,
        'missing value');

    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 3 < buffer.length,
        'Trying to write beyond buffer length');

    verifsint(value, 0x7fffffff, -0x80000000);
  }

  if (value >= 0) {
    writeUInt32(buffer, value, offset, isBigEndian, noAssert);
  } else {
    writeUInt32(buffer, 0xffffffff + value + 1, offset, isBigEndian, noAssert);
  }
}

Buffer.prototype.writeInt32LE = function(value, offset, noAssert) {
  writeInt32(this, value, offset, false, noAssert);
};

Buffer.prototype.writeInt32BE = function(value, offset, noAssert) {
  writeInt32(this, value, offset, true, noAssert);
};

function writeFloat(buffer, value, offset, isBigEndian, noAssert) {
  if (!noAssert) {
    assert.ok(value !== undefined && value !== null,
        'missing value');

    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 3 < buffer.length,
        'Trying to write beyond buffer length');

    verifIEEE754(value, 3.4028234663852886e+38, -3.4028234663852886e+38);
  }

  require('./buffer_ieee754').writeIEEE754(buffer, value, offset, isBigEndian,
      23, 4);
}

Buffer.prototype.writeFloatLE = function(value, offset, noAssert) {
  writeFloat(this, value, offset, false, noAssert);
};

Buffer.prototype.writeFloatBE = function(value, offset, noAssert) {
  writeFloat(this, value, offset, true, noAssert);
};

function writeDouble(buffer, value, offset, isBigEndian, noAssert) {
  if (!noAssert) {
    assert.ok(value !== undefined && value !== null,
        'missing value');

    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 7 < buffer.length,
        'Trying to write beyond buffer length');

    verifIEEE754(value, 1.7976931348623157E+308, -1.7976931348623157E+308);
  }

  require('./buffer_ieee754').writeIEEE754(buffer, value, offset, isBigEndian,
      52, 8);
}

Buffer.prototype.writeDoubleLE = function(value, offset, noAssert) {
  writeDouble(this, value, offset, false, noAssert);
};

Buffer.prototype.writeDoubleBE = function(value, offset, noAssert) {
  writeDouble(this, value, offset, true, noAssert);
};

SlowBuffer.prototype.readUInt8 = Buffer.prototype.readUInt8;
SlowBuffer.prototype.readUInt16LE = Buffer.prototype.readUInt16LE;
SlowBuffer.prototype.readUInt16BE = Buffer.prototype.readUInt16BE;
SlowBuffer.prototype.readUInt32LE = Buffer.prototype.readUInt32LE;
SlowBuffer.prototype.readUInt32BE = Buffer.prototype.readUInt32BE;
SlowBuffer.prototype.readInt8 = Buffer.prototype.readInt8;
SlowBuffer.prototype.readInt16LE = Buffer.prototype.readInt16LE;
SlowBuffer.prototype.readInt16BE = Buffer.prototype.readInt16BE;
SlowBuffer.prototype.readInt32LE = Buffer.prototype.readInt32LE;
SlowBuffer.prototype.readInt32BE = Buffer.prototype.readInt32BE;
SlowBuffer.prototype.readFloatLE = Buffer.prototype.readFloatLE;
SlowBuffer.prototype.readFloatBE = Buffer.prototype.readFloatBE;
SlowBuffer.prototype.readDoubleLE = Buffer.prototype.readDoubleLE;
SlowBuffer.prototype.readDoubleBE = Buffer.prototype.readDoubleBE;
SlowBuffer.prototype.writeUInt8 = Buffer.prototype.writeUInt8;
SlowBuffer.prototype.writeUInt16LE = Buffer.prototype.writeUInt16LE;
SlowBuffer.prototype.writeUInt16BE = Buffer.prototype.writeUInt16BE;
SlowBuffer.prototype.writeUInt32LE = Buffer.prototype.writeUInt32LE;
SlowBuffer.prototype.writeUInt32BE = Buffer.prototype.writeUInt32BE;
SlowBuffer.prototype.writeInt8 = Buffer.prototype.writeInt8;
SlowBuffer.prototype.writeInt16LE = Buffer.prototype.writeInt16LE;
SlowBuffer.prototype.writeInt16BE = Buffer.prototype.writeInt16BE;
SlowBuffer.prototype.writeInt32LE = Buffer.prototype.writeInt32LE;
SlowBuffer.prototype.writeInt32BE = Buffer.prototype.writeInt32BE;
SlowBuffer.prototype.writeFloatLE = Buffer.prototype.writeFloatLE;
SlowBuffer.prototype.writeFloatBE = Buffer.prototype.writeFloatBE;
SlowBuffer.prototype.writeDoubleLE = Buffer.prototype.writeDoubleLE;
SlowBuffer.prototype.writeDoubleBE = Buffer.prototype.writeDoubleBE;

});

require.define("assert",function(require,module,exports,__dirname,__filename,process,global){// UTILITY
var util = require('util');
var Buffer = require("buffer").Buffer;
var pSlice = Array.prototype.slice;

function objectKeys(object) {
  if (Object.keys) return Object.keys(object);
  var result = [];
  for (var name in object) {
    if (Object.prototype.hasOwnProperty.call(object, name)) {
      result.push(name);
    }
  }
  return result;
}

// 1. The assert module provides functions that throw
// AssertionError's when particular conditions are not met. The
// assert module must conform to the following interface.

var assert = module.exports = ok;

// 2. The AssertionError is defined in assert.
// new assert.AssertionError({ message: message,
//                             actual: actual,
//                             expected: expected })

assert.AssertionError = function AssertionError(options) {
  this.name = 'AssertionError';
  this.message = options.message;
  this.actual = options.actual;
  this.expected = options.expected;
  this.operator = options.operator;
  var stackStartFunction = options.stackStartFunction || fail;

  if (Error.captureStackTrace) {
    Error.captureStackTrace(this, stackStartFunction);
  }
};
util.inherits(assert.AssertionError, Error);

function replacer(key, value) {
  if (value === undefined) {
    return '' + value;
  }
  if (typeof value === 'number' && (isNaN(value) || !isFinite(value))) {
    return value.toString();
  }
  if (typeof value === 'function' || value instanceof RegExp) {
    return value.toString();
  }
  return value;
}

function truncate(s, n) {
  if (typeof s == 'string') {
    return s.length < n ? s : s.slice(0, n);
  } else {
    return s;
  }
}

assert.AssertionError.prototype.toString = function() {
  if (this.message) {
    return [this.name + ':', this.message].join(' ');
  } else {
    return [
      this.name + ':',
      truncate(JSON.stringify(this.actual, replacer), 128),
      this.operator,
      truncate(JSON.stringify(this.expected, replacer), 128)
    ].join(' ');
  }
};

// assert.AssertionError instanceof Error

assert.AssertionError.__proto__ = Error.prototype;

// At present only the three keys mentioned above are used and
// understood by the spec. Implementations or sub modules can pass
// other keys to the AssertionError's constructor - they will be
// ignored.

// 3. All of the following functions must throw an AssertionError
// when a corresponding condition is not met, with a message that
// may be undefined if not provided.  All assertion methods provide
// both the actual and expected values to the assertion error for
// display purposes.

function fail(actual, expected, message, operator, stackStartFunction) {
  throw new assert.AssertionError({
    message: message,
    actual: actual,
    expected: expected,
    operator: operator,
    stackStartFunction: stackStartFunction
  });
}

// EXTENSION! allows for well behaved errors defined elsewhere.
assert.fail = fail;

// 4. Pure assertion tests whether a value is truthy, as determined
// by !!guard.
// assert.ok(guard, message_opt);
// This statement is equivalent to assert.equal(true, guard,
// message_opt);. To test strictly for the value true, use
// assert.strictEqual(true, guard, message_opt);.

function ok(value, message) {
  if (!!!value) fail(value, true, message, '==', assert.ok);
}
assert.ok = ok;

// 5. The equality assertion tests shallow, coercive equality with
// ==.
// assert.equal(actual, expected, message_opt);

assert.equal = function equal(actual, expected, message) {
  if (actual != expected) fail(actual, expected, message, '==', assert.equal);
};

// 6. The non-equality assertion tests for whether two objects are not equal
// with != assert.notEqual(actual, expected, message_opt);

assert.notEqual = function notEqual(actual, expected, message) {
  if (actual == expected) {
    fail(actual, expected, message, '!=', assert.notEqual);
  }
};

// 7. The equivalence assertion tests a deep equality relation.
// assert.deepEqual(actual, expected, message_opt);

assert.deepEqual = function deepEqual(actual, expected, message) {
  if (!_deepEqual(actual, expected)) {
    fail(actual, expected, message, 'deepEqual', assert.deepEqual);
  }
};

function _deepEqual(actual, expected) {
  // 7.1. All identical values are equivalent, as determined by ===.
  if (actual === expected) {
    return true;

  } else if (Buffer.isBuffer(actual) && Buffer.isBuffer(expected)) {
    if (actual.length != expected.length) return false;

    for (var i = 0; i < actual.length; i++) {
      if (actual[i] !== expected[i]) return false;
    }

    return true;

  // 7.2. If the expected value is a Date object, the actual value is
  // equivalent if it is also a Date object that refers to the same time.
  } else if (actual instanceof Date && expected instanceof Date) {
    return actual.getTime() === expected.getTime();

  // 7.3. Other pairs that do not both pass typeof value == 'object',
  // equivalence is determined by ==.
  } else if (typeof actual != 'object' && typeof expected != 'object') {
    return actual == expected;

  // 7.4. For all other Object pairs, including Array objects, equivalence is
  // determined by having the same number of owned properties (as verified
  // with Object.prototype.hasOwnProperty.call), the same set of keys
  // (although not necessarily the same order), equivalent values for every
  // corresponding key, and an identical 'prototype' property. Note: this
  // accounts for both named and indexed properties on Arrays.
  } else {
    return objEquiv(actual, expected);
  }
}

function isUndefinedOrNull(value) {
  return value === null || value === undefined;
}

function isArguments(object) {
  return Object.prototype.toString.call(object) == '[object Arguments]';
}

function objEquiv(a, b) {
  if (isUndefinedOrNull(a) || isUndefinedOrNull(b))
    return false;
  // an identical 'prototype' property.
  if (a.prototype !== b.prototype) return false;
  //~~~I've managed to break Object.keys through screwy arguments passing.
  //   Converting to array solves the problem.
  if (isArguments(a)) {
    if (!isArguments(b)) {
      return false;
    }
    a = pSlice.call(a);
    b = pSlice.call(b);
    return _deepEqual(a, b);
  }
  try {
    var ka = objectKeys(a),
        kb = objectKeys(b),
        key, i;
  } catch (e) {//happens when one is a string literal and the other isn't
    return false;
  }
  // having the same number of owned properties (keys incorporates
  // hasOwnProperty)
  if (ka.length != kb.length)
    return false;
  //the same set of keys (although not necessarily the same order),
  ka.sort();
  kb.sort();
  //~~~cheap key test
  for (i = ka.length - 1; i >= 0; i--) {
    if (ka[i] != kb[i])
      return false;
  }
  //equivalent values for every corresponding key, and
  //~~~possibly expensive deep test
  for (i = ka.length - 1; i >= 0; i--) {
    key = ka[i];
    if (!_deepEqual(a[key], b[key])) return false;
  }
  return true;
}

// 8. The non-equivalence assertion tests for any deep inequality.
// assert.notDeepEqual(actual, expected, message_opt);

assert.notDeepEqual = function notDeepEqual(actual, expected, message) {
  if (_deepEqual(actual, expected)) {
    fail(actual, expected, message, 'notDeepEqual', assert.notDeepEqual);
  }
};

// 9. The strict equality assertion tests strict equality, as determined by ===.
// assert.strictEqual(actual, expected, message_opt);

assert.strictEqual = function strictEqual(actual, expected, message) {
  if (actual !== expected) {
    fail(actual, expected, message, '===', assert.strictEqual);
  }
};

// 10. The strict non-equality assertion tests for strict inequality, as
// determined by !==.  assert.notStrictEqual(actual, expected, message_opt);

assert.notStrictEqual = function notStrictEqual(actual, expected, message) {
  if (actual === expected) {
    fail(actual, expected, message, '!==', assert.notStrictEqual);
  }
};

function expectedException(actual, expected) {
  if (!actual || !expected) {
    return false;
  }

  if (expected instanceof RegExp) {
    return expected.test(actual);
  } else if (actual instanceof expected) {
    return true;
  } else if (expected.call({}, actual) === true) {
    return true;
  }

  return false;
}

function _throws(shouldThrow, block, expected, message) {
  var actual;

  if (typeof expected === 'string') {
    message = expected;
    expected = null;
  }

  try {
    block();
  } catch (e) {
    actual = e;
  }

  message = (expected && expected.name ? ' (' + expected.name + ').' : '.') +
            (message ? ' ' + message : '.');

  if (shouldThrow && !actual) {
    fail('Missing expected exception' + message);
  }

  if (!shouldThrow && expectedException(actual, expected)) {
    fail('Got unwanted exception' + message);
  }

  if ((shouldThrow && actual && expected &&
      !expectedException(actual, expected)) || (!shouldThrow && actual)) {
    throw actual;
  }
}

// 11. Expected to throw an error:
// assert.throws(block, Error_opt, message_opt);

assert.throws = function(block, /*optional*/error, /*optional*/message) {
  _throws.apply(this, [true].concat(pSlice.call(arguments)));
};

// EXTENSION! This is annoying to write outside this module.
assert.doesNotThrow = function(block, /*optional*/error, /*optional*/message) {
  _throws.apply(this, [false].concat(pSlice.call(arguments)));
};

assert.ifError = function(err) { if (err) {throw err;}};

});

require.define("/node_modules/buffer-browserify/node_modules/base64-js/package.json",function(require,module,exports,__dirname,__filename,process,global){module.exports = {"main":"lib/b64.js"}
});

require.define("/node_modules/buffer-browserify/node_modules/base64-js/lib/b64.js",function(require,module,exports,__dirname,__filename,process,global){(function (exports) {
	'use strict';

	var lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

	function b64ToByteArray(b64) {
		var i, j, l, tmp, placeHolders, arr;
	
		if (b64.length % 4 > 0) {
			throw 'Invalid string. Length must be a multiple of 4';
		}

		// the number of equal signs (place holders)
		// if there are two placeholders, than the two characters before it
		// represent one byte
		// if there is only one, then the three characters before it represent 2 bytes
		// this is just a cheap hack to not do indexOf twice
		placeHolders = b64.indexOf('=');
		placeHolders = placeHolders > 0 ? b64.length - placeHolders : 0;

		// base64 is 4/3 + up to two characters of the original data
		arr = [];//new Uint8Array(b64.length * 3 / 4 - placeHolders);

		// if there are placeholders, only get up to the last complete 4 chars
		l = placeHolders > 0 ? b64.length - 4 : b64.length;

		for (i = 0, j = 0; i < l; i += 4, j += 3) {
			tmp = (lookup.indexOf(b64[i]) << 18) | (lookup.indexOf(b64[i + 1]) << 12) | (lookup.indexOf(b64[i + 2]) << 6) | lookup.indexOf(b64[i + 3]);
			arr.push((tmp & 0xFF0000) >> 16);
			arr.push((tmp & 0xFF00) >> 8);
			arr.push(tmp & 0xFF);
		}

		if (placeHolders === 2) {
			tmp = (lookup.indexOf(b64[i]) << 2) | (lookup.indexOf(b64[i + 1]) >> 4);
			arr.push(tmp & 0xFF);
		} else if (placeHolders === 1) {
			tmp = (lookup.indexOf(b64[i]) << 10) | (lookup.indexOf(b64[i + 1]) << 4) | (lookup.indexOf(b64[i + 2]) >> 2);
			arr.push((tmp >> 8) & 0xFF);
			arr.push(tmp & 0xFF);
		}

		return arr;
	}

	function uint8ToBase64(uint8) {
		var i,
			extraBytes = uint8.length % 3, // if we have 1 byte left, pad 2 bytes
			output = "",
			temp, length;

		function tripletToBase64 (num) {
			return lookup[num >> 18 & 0x3F] + lookup[num >> 12 & 0x3F] + lookup[num >> 6 & 0x3F] + lookup[num & 0x3F];
		};

		// go through the array every three bytes, we'll deal with trailing stuff later
		for (i = 0, length = uint8.length - extraBytes; i < length; i += 3) {
			temp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2]);
			output += tripletToBase64(temp);
		}

		// pad the end with zeros, but make sure to not forget the extra bytes
		switch (extraBytes) {
			case 1:
				temp = uint8[uint8.length - 1];
				output += lookup[temp >> 2];
				output += lookup[(temp << 4) & 0x3F];
				output += '==';
				break;
			case 2:
				temp = (uint8[uint8.length - 2] << 8) + (uint8[uint8.length - 1]);
				output += lookup[temp >> 10];
				output += lookup[(temp >> 4) & 0x3F];
				output += lookup[(temp << 2) & 0x3F];
				output += '=';
				break;
		}

		return output;
	}

	module.exports.toByteArray = b64ToByteArray;
	module.exports.fromByteArray = uint8ToBase64;
}());

});

require.define("/node_modules/buffer-browserify/buffer_ieee754.js",function(require,module,exports,__dirname,__filename,process,global){exports.readIEEE754 = function(buffer, offset, isBE, mLen, nBytes) {
  var e, m,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      nBits = -7,
      i = isBE ? 0 : (nBytes - 1),
      d = isBE ? 1 : -1,
      s = buffer[offset + i];

  i += d;

  e = s & ((1 << (-nBits)) - 1);
  s >>= (-nBits);
  nBits += eLen;
  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8);

  m = e & ((1 << (-nBits)) - 1);
  e >>= (-nBits);
  nBits += mLen;
  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8);

  if (e === 0) {
    e = 1 - eBias;
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity);
  } else {
    m = m + Math.pow(2, mLen);
    e = e - eBias;
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen);
};

exports.writeIEEE754 = function(buffer, value, offset, isBE, mLen, nBytes) {
  var e, m, c,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0),
      i = isBE ? (nBytes - 1) : 0,
      d = isBE ? -1 : 1,
      s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0;

  value = Math.abs(value);

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0;
    e = eMax;
  } else {
    e = Math.floor(Math.log(value) / Math.LN2);
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--;
      c *= 2;
    }
    if (e + eBias >= 1) {
      value += rt / c;
    } else {
      value += rt * Math.pow(2, 1 - eBias);
    }
    if (value * c >= 2) {
      e++;
      c /= 2;
    }

    if (e + eBias >= eMax) {
      m = 0;
      e = eMax;
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * Math.pow(2, mLen);
      e = e + eBias;
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
      e = 0;
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8);

  e = (e << mLen) | m;
  eLen += mLen;
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8);

  buffer[offset + i - d] |= s * 128;
};

});

require.define("udplib",function(require,module,exports,__dirname,__filename,process,global){var util = require('./iputil');
var enet = require('enet');

exports.enet = enet;
exports.createSocket = createSocket

var localip = util.getLocalIP();
var default_local_ip="0.0.0.0";

if (localip.length > 0) {
    var list = [];
    for(var i = 0; i < localip.length; i++){
        if( localip[i] != "127.0.0.1") { default_local_ip=localip[i]; break;}
    }
}

function createSocket(lib, incomingCallback, port, ip){
    switch(lib){
        case "node":
            return createNodeDgramSocket(incomingCallback, port, ip);
        case "enet":
            return createENetHost(incomingCallback, port, ip);
        default:
            return createNodeDgramSocket(incomingCallback, port, ip);
    }
}

function createNodeDgramSocket(cb,port,ip){
    var dgram = require('dgram');
    var socket =  dgram.createSocket("udp4",cb);
    if(port ==-1) port=42424;//default telehash port   
    socket.bind(port,ip);
    
    socket.address_original = socket.address;
    socket.address= function(){
            var addr;
            if(ip == "0.0.0.0" || this.address_original().address=="0.0.0.0") {
                addr=default_local_ip;            
            }else addr = this.address_original().address;
            
            return{ address:addr, port:this.address_original().port};
     }
     return socket;
}

function createENetHost(cb,port,ip){
    if(port == -1) port=42424; //defualt telehash port
    var addr = new enet.Address(ip,port);
    var host = new enet.Host(addr,64);

    host.on("telex",cb);
    host.start_watcher();
    host.peers = {};
    return ({
        enet:true,
        send:function(msg,start_index,length,port,ip){
            host.send(ip,port,msg);
        },
        close:function(){
            host.stop_watcher();            
        },
        host:host,
        address:function(){
            if(ip && ip!="0.0.0.0") return ({address:ip, port:this.host.address().port()});
            return ({
                address:default_local_ip, 
                port:this.host.address().port()
            });
        }
    });
}

});

require.define("hash",function(require,module,exports,__dirname,__filename,process,global){var crypto = require('crypto');

/**
 * Hash objects represent the sha1 of string content,
 * with methods useful to DHT calculations.
 * @constructor
 */
function Hash(value, hex) {
    if(value == undefined) value = "";
    if(hex) this.digest = hex2buf(hex);
    // if failed still, just treat as a string
    if (!this.digest) {
        var hashAlgorithm = crypto.createHash("sha1");
        hashAlgorithm.update(value);
        //this.digest = new Buffer(hashAlgorithm.digest("base64"), "base64");
        this.digest = hex2buf(hashAlgorithm.digest("hex"));//better for crypto-browserify
    }
    this.nibbles = [];
    for (var i = 0; i < this.digest.length; i++) {
        this.nibbles[this.nibbles.length] = this.digest[i] >> 4;
        this.nibbles[this.nibbles.length] = this.digest[i] & 0xf;
    }
}

function hex2buf(str)
{
    var buf = new Buffer(20);
    for (var i = 0; i < str.length / 2; i ++) {
        var byte = parseInt(str.substr(i * 2, 2), 16);
        if (isNaN(byte)) return null;
        buf[i] = byte;
    }
    return buf;
}

/**
 * Format a byte as a two digit hex string.
 */
function byte2hex(d) {
    return d < 16 ? "0" + d.toString(16) : d.toString(16);
}


exports.Hash = Hash

/**
 * Get the string hash as geometrically "far" as possible from this one.
 * That would be the logical inverse, every bit flipped.
 */
Hash.prototype.far = function() {
    var result = [];
    for (var i = 0; i < this.digest.length; i++) {
        result[i] = byte2hex(this.digest[i] ^ 0xff);
    }
    return result.join("");
}

/**
 * Logical bitwise 'or' this hash with another.
 */
Hash.prototype.or = function(h) {
    if (typeof h == 'string') { h = new Hash(h); }

    var result = new Hash();
    result.digest = new Buffer(this.digest.length);
    for (var i = 0; i < this.digest.length; i++) {
        result.digest[i] = this.digest[i] ^ h.digest[i];
    }
    return result;
}

/**
 * Comparator for hash objects.
 */
Hash.prototype.cmp = function(h) {
    for (var i = 0; i < this.digest.length; i++) {
        var d = this.digest[i] - h.digest[i];
        if (d != 0) {
            return d;
        }
    }
    return 0;
}

/**
 * XOR distance between two sha1 hex hashes, 159 is furthest bit, 0 is closest bit, -1 is same hash
 */
Hash.prototype.distanceTo = function(h) {
    var sbtab = [-1,0,1,1,2,2,2,2,3,3,3,3,3,3,3,3];
    var ret = 156;
    for (var i = 0; i < this.nibbles.length; i++) {
        var diff = this.nibbles[i] ^ h.nibbles[i];
        if (diff) {
            return ret + sbtab[diff];
        }
        ret -= 4;
    }
    return -1; // samehash ?!
}

/**
 * Represent the hash as a hexadecimal string.
 */
Hash.prototype.toString = function() {
    var result = [];
    for (var i = this.digest.length - 1; i >= 0; i--) {
        result[i] = byte2hex(this.digest[i]);
    }
    return result.join("");
}

/**
 * Test if two hashes are equal.
 */
Hash.prototype.equals = function(h) {
    return this.toString() == h.toString();
}

});

require.define("switch",function(require,module,exports,__dirname,__filename,process,global){var async = require('async');
var hlib = require('./hash');
var util = require('./iputil');

//switch operating mode
var MODE = {
    FULL:3,
    LISTENER: 2,
    ANNOUNCER:1
};

// global hash of all known switches by ipp
var network = {};

// A Full Switch needs to do basic duplicate detection, it should only process a unique set of signals at
// most once every 10 seconds (hash the sorted string sigs/values).

// cache: keeps tracks of processed signals
var signalsCache = {};
function cacheHit( telex ){
    var sigarray = [];

    Object.keys(telex).forEach( function(key){
        if( key[0]='+' ) sigarray.push( key+JSON.stringify(telex[key]));
    });
    
    sigarray.sort(function(a,b){
        return (a > b);
    });
    
    var hash = new hlib.Hash(sigarray.join('')).toString();
    
    if(signalsCache[hash] && (signalsCache[hash] +10000 > Date.now())) return true;//cache hit 
    
    signalsCache[hash] = Date.now();
    return false;//cache miss
  
}

// callbacks must be set first, and must have 
// .data(switch, {telex for app}) and .sock.send() being udp socket send, news(switch) for new switch creation
var master = {
    data: function () {},
    signals: function () {},
    sock: {
        send: function () {}
    },
    news: function () {}
};
exports.setCallbacks = function (m) {
    master = m;
}

// return array of all
function getSwitches() {
    var arr = [];
    Object.keys(network).forEach(function (key) {
        arr.push(network[key]);
    });
    return arr;
}
exports.getSwitches = getSwitches;

function getSwitch(ipp,arg) {
    if (network[ipp]) return network[ipp];
    return (new Switch(ipp,arg));
    // create new one!
}
exports.getSwitch = getSwitch;

function knownSwitch(ipp) {
    return (ipp in network);
}
exports.knownSwitch = knownSwitch;

function getSelf() {
    var me = undefined;
    Object.keys(network).forEach(function (key) {
        if (network[key].self == true) me = network[key];
    });
    return me;
}

// return array of switches closest to the endh, s (optional optimized staring switch), num (default 5, optional)
function getNear(endh, s, num) {
    // for not just sort all, TODO use mesh, also can use a dirty list mixed with mesh
    if (!num) num = 5;
    var x = Object.keys(network).sort(function (a, b) {
        return endh.distanceTo(network[a].hash) - endh.distanceTo(network[b].hash);
    });
    
    x = x.filter(function(a){
        var sw = network[a];
        if(sw.self && sw.visible) return true;
        return( sw.line && sw.visible && sw.healthy() );
    });
    
    return x.slice(0, num);
}
exports.getNear = getNear;

// every seen IPP becomes a switch object that maintains itself
function Switch(ipp, arg) {
    // initialize the absolute minimum here to keep this lightweight as it's used all the time
    this.ipp = ipp;
    this.hash = new hlib.Hash(ipp);
    network[this.ipp] = this;
    this.end = this.hash.toString();
    if(arg) this.via = arg.via; // optionally, which switch introduced us
    this.ATinit = Date.now();
    this.misses = 0;
    this.seed = false;
    this.ip = this.ipp.substr(0, this.ipp.indexOf(':'));
    this.port = parseInt(this.ipp.substr(this.ipp.indexOf(':') + 1));
    //console.error("New Switch created: " + this.ipp);
    if( arg && (arg.via || arg.init) ){
        //this switch has been .seen or we are creating it directly using 'new Switch(ipp, {init:true})'
        master.news(this);//pop it, ping it and open a line!
    }else{
        //the switch is being created indirectly by getSwitch(ipp) when we get a new telex from an unknown switch
        //or when we are trying to send a telex to a yet unknown switch.
    }
    return this;
}
//since this is a high-level API discourage use of Switch directly.
//exports.Switch = Switch;

// process incoming telex from this switch
Switch.prototype.process = function (telex, rawlen) {
    // do all the integrity and line validation stuff
    if (!validate(this, telex)) return;

    
    // basic header tracking
    if (!this.BR) this.BR = 0;
    this.BR += rawlen;
    // they can't send us that much more than what we've told them to, bad!
    if (this.BRout && this.BR - this.BRout > 12000) return;
    this.BRin = (telex._br) ? parseInt(telex._br) : undefined;
    if (this.BRin < 0) delete this.line; // negativity is intentionally signalled line drop (experimental)
    
    // TODO, if no ATrecv yet but we sent only a single +end last (dialing) and a +pop request for this ip, this 
    // could be a NAT pingback and we should re-send our dial immediately
    
    
    // timer tracking
    this.ATrecv = Date.now();

    // responses mean healthy
    delete this.ATexpected;
    delete this.misses;

    // process serially per switch
    telex._ = this; // async eats 'this'
    if (!this.queue) this.queue = async.queue(worker, 1);
    this.queue.push(telex);
}

function worker(telex, callback) {
    var s = telex._;
    delete telex._; // get owning switch, repair    
        
    if (telex['_line'] == s.line) { //assuming telex is validated there should be a _line open
        if (Array.isArray(telex['.see'])) doSee(s, telex['.see']);
        if (master.mode()==MODE.FULL && Array.isArray(telex['.tap'])) doTap(s, telex['.tap']);
    }      
    
    if (telex['+end'] && (!telex._hop || parseInt(telex._hop) == 0)) {
        if(master.mode()==MODE.FULL) doEnd(s, new hlib.Hash(null, telex['+end']));
        callback();//dont process telex further: dial telexes should only contain an +end signal with _hop=0
        return;
    }
        
    // if there's any signals, check for matching taps to relay to
    if (Object.keys(telex).some(function (x) {return x[0] == '+'}) && !(parseInt(telex['_hop']) >= 4)) {    
        if(cacheHit(telex)) {
            callback();return;
        }
        doSignals(s, telex);
    } else {
        //else added to prevent passing telex to both master.data and master.signals if a telex contains both
        //signals and data which we are tapping for
            
        // if there's any raw data, send to master
        if (Object.keys(telex).some(function (x) {
            return (x[0] != '+' && x[0] != '.' && x[0] != '_')
        })) master.data(s, telex);
    }
    callback();
}

    /*
        Notes from proto spec on dampening..
        Dampening is used to reduce congestion around any single Switch or group of them nearby when there is a lot of signals or listeners coming in around one or more Ends. There are two strategies, one when all the traffic is to a single End, and another when it's just to one part of the ring (different but nearby Ends). A Switch should not .see back to anyone the IP:PORT of any other Switch when it's _br is sufficiently out of sync with it (need to test to find an appropriate window here), this dampens general parts of the DHT when traffic might flow beyond any Switches desire or ability to respond to. Secondarily, any Switch should return itself as the endpoint for any End that is the most popular one it is seeing (also need to test to find best time window to check popularity).
    */
function doEnd(s, endh) {
    s.popped = true; //switch was able to contact us directly so it's 'popped'
    var me = getSelf();
    var near = getNear(endh);    
    //TODO: if the nearer Switches are dampened (congestion control) .see back only ourselves.
    
    // only allow private IPs if we are seeding with a private DHT
    // and only allow public IPs if we are seeding with a public DHT
    var valid = near.filter(function (ipp) {
        return util.isPrivateIP(me.ipp) == util.isPrivateIP(ipp);
    });
    
    // If none are closer (relative to us) .see back only ourselves.
    var closer = valid.filter(function(ipp){
        return (endh.distanceTo(network[ipp].hash) < me.hash.distanceTo(endh));
    });    
    if(!closer.length) closer = [me.ipp];
    
    s.send({
        '.see': closer
    });
}

// automatically turn every new ipp into a switch, important for getNear being useful too
function doSee(s, see) {
    var me = getSelf();
    if (!me) return; //make sure we have established our identity first..
    see.forEach(function (ipp) {

        if (master.nat()) {
            //if we are behing NAT and this new switch matches our ip then it is behind the same NAT
            //we can't talk so ignore it.(unless the NAT router supports hair pinning..which is rare)
            if (util.isSameIP(me.ipp, ipp)) return;
            //ignore non-internet routable addresses.. 192.168.x.x/16 172.16.x.x/12 and 10.x.x.x/8 ..
            if (util.isPrivateIP(ipp)) return;
        } else {
            //only allow private IPs if we are seeding with a private DHT
            //and only allow public IPs if we are seeding with a public DHT
            if (util.isPrivateIP(me.ipp) != util.isPrivateIP(ipp)) return;
        }

	getSwitch(ipp,{via:s.ipp}).visible=true;
    });
}

function doTap(s, tap) {
    // do some validation?
    // todo: index these much faster
    //console.error("Got TAP Request:" + JSON.stringify(tap));
    s.rules = tap;
    //check: should we send a response to a .tap request?
}

function doSignals(s, telex) {
    
    //only if we are not behind a symmetric NAT, parse the th:ipp and send them an empty telex to pop!
    //we dont need to pop if we are not behind a NAT..
    if(telex['+pop']){
        if (master.nat() && !master.snat()) {
            var me = getSelf();
            if (me && me.end == telex['+end']) {
                var empty_telex = new Buffer(JSON.stringify({}) + '\n', "utf8");
                var ipp = telex['+pop'].substr(3); //stip off the 'th:'
                var ip = util.IP(ipp);
                var port = util.PORT(ipp);
                master.sock.send(empty_telex, 0, empty_telex.length, port, ip);
                //console.error("popping firewall to:" + ip + ":" + port);
                return;
            }
        }
    }
    
    // find any network.*.rules and match, relay the signals            
    if(master.mode()==MODE.FULL){
        getSwitches().forEach(function (aswitch) {
            if(!aswitch.rules) return;//ignore switches which dont have an active .tap
            if(aswitch.self) return;//our taps are handeled by master.signals()
            for (var i in aswitch.rules) {
                if (telexMatchesRule(telex, aswitch.rules[i])) {
                    aswitch.forward(telex); 
                    return; //forward telex only once to the switch
                }
            }
        });
    }
    master.signals(s, telex);//pass it to user application
}

function telexMatchesRule(telex, rule) {

    if (!rule['is'] && !rule['has']) return false; //not a valid rule to match
    if (rule['is']) {
        var is = rule['is'];
        //match exact signal and value
        for(var key in is){
            if (telex[key] != is[key]) return false;
        }        
    }

    if (rule['has']) {
        var miss = false;
        //look only for existance of signal
        rule['has'].forEach(function (h) {
            if (!telex[h]) miss = true;
        });
        if (miss) return false;
    }
    //if we made it here telex matched rule!
    return true;
}
exports.ruleMatch = telexMatchesRule;

//forward an incoming telex, strip out headers keeping signals
Switch.prototype.forward = function (telex, arg) {
    var newTelex = {};

    Object.keys(telex).forEach(function (key) {
        //copy signals to new telex
        if (key[0] == '+') newTelex[key] = telex[key];    
    });
    
    //increment _hop by 1
    newTelex['_hop'] = (telex['_hop'] || 0 ) + 1; //receiving switch will not process +end signal as a dial
    
    //console.error("Forwarding Signals:" + JSON.stringify(newTelex) + " TO:" + this.ipp);
    this.send(newTelex);
}

// send telex to switch
Switch.prototype.send = function (telex) {
 
    if (this.self) return; // flag to not send to ourselves!

    // if last time we sent there was an expected response and never got it, count it as a miss for health check
    if (this.ATexpected < Date.now()) this.misses = this.misses + 1 || 1;
    delete this.ATexpected;
    // if we expect a reponse, in 10sec we should count it as a miss if nothing
    // if we are forwarding an +end signal (_hop > 0) dont expect a .see response.
    if (telex['+end'] && (!telex._hop||telex._hop==0) ) this.ATexpected = Date.now() + 10000;
    //if(telex['.tap']) this.ATexpected = Date.now() + 10000; //check: do we excpect a response to a .tap?
    
    // check bytes sent vs received and drop if too much so we don't flood
    if (!this.Bsent) this.Bsent = 0;
    if (this.Bsent - this.BRin > 10000) {
        //console.error("FLOODING " + this.ipp + ", dropping " + JSON.stringify(telex));
        return;
    }
    
    if(master.mode() != MODE.ANNOUNCER ){
        if (!this.ring) this.ring = Math.floor((Math.random() * 32768) + 1);
    }
    
    //make copy of telex.. and send that .. dont alter telex
    var telexOut = {};
    Object.keys(telex).forEach(function (key) {
        telexOut[key] = telex[key];
    });
    
    telexOut._to = this.ipp;

    if(master.mode() != MODE.ANNOUNCER){
        // try to handshake in case we need to talk again
        this.line ? telexOut._line = this.line : telexOut._ring = this.ring;
    }
    
    // send the bytes we've received, if any
    if (this.BR) telexOut._br = this.BRout = this.BR;

    var msg = new Buffer(JSON.stringify(telexOut) + '\n', "utf8"); // \n is nice for testing w/ netcat
    //if (msg.length > 1400) console.error("WARNING, large datagram might not survive MTU " + msg.length);

    // track bytes we've sent
    if (!this.Bsent) this.Bsent = 0;
    this.Bsent += msg.length;
    this.ATsent = Date.now();


    //console.error("-->\t" + this.ipp + "\t" + msg.toString());
    master.sock.send(msg, 0, msg.length, this.port, this.ip);
}

// necessary utility to see if the switch is in a known healthy state
Switch.prototype.healthy = function () {
    if (this.self) return true; // we're always healthy haha
    //if(!this.popped) return true; //give a chance for switch to atleast get popped
    if (this.ATinit > (Date.now() - 10000)) return true; // new switches are healthy for 10 seconds!
    if (!this.ATrecv) return false; // no packet, no love
    if (Date.now() > (this.ATrecv + 60000)) return false; //haven't recieved anything in last minute 
    if (this.misses > 2) return false; // three strikes
    if (this.Bsent - this.BRin > 10000) return false; // more than 10k hasn't been acked
    return true; // <3 everyone else
}

Switch.prototype.drop = function () {
    //PURGE!:  delete main reference to self, should auto-GC if no others
    //console.error('purging.. ' + this.ipp);
    if (this.healthy()) this.send({
        _br: -10000
    });
    delete network[this.ipp];
}

// make sure this telex is valid coming from this switch, and twiddle our bits
function validate(s, t) {
    // first, if it's been more than 10 seconds after a line opened,
    // be super strict, no more ringing allowed, _line absolutely required
    if (s.ATline && s.ATline + 10000 < Date.now() && t._line != s.line) return false;
    
    // second, process incoming _line
    if (t._line) {
        // can't get a _line w/o having sent a _ring
        if (s.ring == undefined) return false;

        // be nice in what we accept, strict in what we send
        t._line = parseInt(t._line);

        // must match if exist
        if (s.line && t._line != s.line) return false;

        // must be a product of our sent ring!!
        if (t._line % s.ring != 0) return false;

        // we can set up the line now if needed
        if (!s.line) {
            s.ringin = t._line / s.ring; // will be valid if the % = 0 above
            s.line = t._line;
            s.ATline = Date.now();
        }
    }

    // last, process any incoming _ring's (remember, could be out of order after a _line and still be valid)
    if (t._ring) {

        // be nice in what we accept, strict in what we send
        t._ring = parseInt(t._ring);

        // already had a ring and this one doesn't match, should be rare
        if (s.ringin && t._ring != s.ringin) return false;

        // make sure within valid range
        if (t._ring <= 0 || t._ring > 32768) return false;

        // we can set up the line now if needed
        //if(s.ATline == 0){ //will never be true!
        
        if (master.mode() != MODE.ANNOUNCER && !s.ATline) { //changed this to calculate the _line on first packet received from a switch with _ring
            s.ringin = t._ring;
            if (!s.ring) s.ring = Math.floor((Math.random() * 32768) + 1);
            s.line = s.ringin * s.ring;
            s.ATline = Date.now();
        }
    }

    // we're valid at this point, line or otherwise
    return true;
}

});

require.define("telehash",function(require,module,exports,__dirname,__filename,process,global){var udplib = require('./udplib');
var slib = require('./switch');
var hlib = require('./hash');
var util = require('./iputil');

// high level exported functions
// init({port:42424, seeds:['1.2.3.4:5678], handleOOB:function(data){},mode:(1|2|3) })
// use it to pass in custom settings other than defaults, optional but if used must be called first!
exports.init = getSelf;

// seed(function(err){}) - will start seeding to dht, calls back w/ error/timeout or after first contact
exports.seed = doSeed;

// before using listen and connect, should seed() first for best karma!

// listen('id', function(switch, telex){}) - give an id to listen to on the dHT, callback fires whenever incoming messages (requests) arrive to it.
// essentially this gives us a way to announce ourselves on the DHT by a sha1 hash of given id. 
// think of the id like a dns hostname,url,email address,mobile number...etc.
exports.listen = doListen;

// connect('id') - id to connect to. Will return a 'connector' object used to send messages (requests), and handle responses
exports.connect = doConnect;

// send('ip:port', {...}) - sends the given telex to the target ip:port
// will attempt to find it and punch through any NATs, etc, but is lossy, no guarantees/confirmations
// it's best to use this function rather than the Switch.prototype.send().
exports.send = doSend;


exports.tap = doTap;
exports.dial = doDial;
exports.announce = doAnnounce;
exports.ping = doPing;

// as expected
exports.shutdown = doShutdown;

// internals
var self;
var listeners = [];         //maintain an array of .tap rules we are interested in
var connectors = {};        //maintains a hashtable of ends we are interested in contacting indexed by a end name.
var responseHandlers = {};  //maintains a hashtable of response handlers indexed by connection 'guid'

/*
   STATE.OFFLINE: initial state
   STATE.SEEDING: only handle packets from seeds to determine our ip:port and NAT type
   STATE.ONLINE full packet processing
   TODO:add callbacks to inform user of the module when switching between states..
*/
var STATE = {
    offline: 0,
    seeding: 1,
    online: 2
};

/* 
Switch Operating Modes..
    Announcer:  Only dials and sends signals, doesn't process any commands other than .see and
                doesn't send any _ring, possibly short-lived.                
    Listener:   Stays running, also supports returning basic _ring/_line/_br so that it can
                send .tap commands in order to receive new signals, but processes no other commands.                
    Full:       Supports all commands and relaying to any active .tap (must not be behind SNAT)
                Full Switches need to implement seeding, keeping lines open, a basic bucketing system
                that tracks active Switches at different distances from themselves. A Full Switch needs
                to do basic duplicate detection, it should only process a unique set of signals at
                most once every 10 seconds (hash the sorted string sigs/values).
*/
var MODE = {
    FULL:3,
    LISTENER: 2,
    ANNOUNCER:1
};

// init self, use this whenever it may not be init'd yet to be safe
function getSelf(arg) {
    if (self) return self;
    self = arg || {};

    if(!self.mode) self.mode = MODE.LISTENER; //default operating mode
    
    self.state = STATE.offline; //start in offline state
    if (!self.seeds) self.seeds = ['178.79.135.146:42424', '208.68.163.247:42424'];

    //detect local interfaces    
    var localifs = util.getLocalIP();
    if(!localifs.length){
        self.nat = true;    //if this is windows and we cannot detect interfaces, force NAT
    }
    // udp socket - If bind port is not specified, pick a random open port.
    self.server = udplib.createSocket(self.udplib? self.udplib:"enet", incomingDgram, self.port ? parseInt(self.port) : 0, self.ip || '0.0.0.0');

    // set up switch master callbacks
    var callbacks = {
        sock:    self.server,
        nat:     function(){ return (self.nat==true || self.snat==true) },
        snat:    function(){ return (self.snat==true) },
        news:    doNews,
        data:    doSignals,
        signals: doSignals,
        mode:   function(){ return self.mode }        
    };
    
    //disable tapping, master signal handlers and limit connect/listen functions with warnings.
    if(self.mode == MODE.ANNOUNCER){
        callbacks.data = callbacks.signals = function(){};
        exports.tap = function(){
            //console.error("WARNING: Tapping not supported in Announcer Mode.");
        };
        exports.connect = function(end_name){
            //console.error("WARNING: No Responses will be received in Announcer Mode");
            return doConnect(end_name, true);
        };
        exports.listen = function(){
            //console.error("WARNING: Listen feature not supported in Announcer Mode.");
        };
    }
    
    slib.setCallbacks(callbacks);

    // start timer to monitor all switches and drop any over thresholds and not in buckets
    self.scanTimeout = setInterval(scan, 25000); // every 25sec, so that it runs 2x in <60 (if behind a NAT to keep mappings alive)
    
    // start timer to send out .taps and dial switches closer to the ends we want to .tap
    self.connect_listen_Interval = setInterval(connect_listen, 5000);

    return self;
}

function resetIdentity() {
    if (self.me) {
        self.me.drop();
    }
    delete self.me;
    listeners = [];
    connectors = {};
    delete self.nat;
    delete self.snat;
}

function doSeed(callback) {
    //make sure we are initialised
    getSelf();

    //we can only seed into DHT when we are offline.
    if (self.state != STATE.offline) {
        return;
    }
    //reset our identity
    resetIdentity();

    console.error("seeding...");
    self.state = STATE.seeding;

    if (callback) self.onSeeded = callback;

    // in 10 seconds, error out if nothing yet!
    self.seedTimeout = setTimeout(function () {
        self.state = STATE.offline; //go back into offline state
        if (self.onSeeded) self.onSeeded("timeout");
        delete self.seedTimeout;
        purgeSeeds();
        //try again...
        doSeed(callback);
    }, 10000);

    pingSeeds();
}

function purgeSeeds() {
    self.seeds.forEach(function (ipp) {
        slib.getSwitch(ipp).drop();
    });
}

function pingSeeds() {
    // loop all seeds, asking for furthest end from them to get the most diverse responses!
    self.seeds.forEach(function (ipp) {
        var hash = new hlib.Hash(ipp);
        var s = slib.getSwitch(ipp);
        s.seed = true; //mark it as a seed - (during scan check if we have lines open to any initial seeds)
        s.visible = true;
        s.popped = true;
        s.send({
            '+end': hash.far()
        });
    });
}

//filter incoming packets based on STATE
function incomingDgram(msg, rinfo) {

    if (self.state == STATE.offline) {
        //drop all packets
        return;
    }
    //who is it from?
    var from = rinfo.address + ":" + rinfo.port;

    //parse the packet..and handle out-of-band packets..
    try {
        var telex = JSON.parse(msg.toString());

    } catch (E) {
        return;
    }

    //at this point we should have a telex for processing
    //console.error("<--\t" + from + "\t" + msg.toString());

    if (self.state == STATE.seeding) {
        //only accept packets from seeds - note: we need at least 2 live seeds for SNAT detection
        for (var i in self.seeds) {
            if (from == self.seeds[i]) {
                handleSeedTelex(telex, from, msg.length);
                break;
            }
        }
        return;
    }
    if (self.state == STATE.online) {
        //process all packets
        handleTelex(telex, from, msg.length);
    }
}

function handleSeedTelex(telex, from, len) {

    //do NAT detection once
    if(!self.nat){
        if (!self.me && telex._to && !util.isLocalIP(telex._to)) {
            //we are behind NAT
            self.nat = true;
            //console.error("NAT detected.");
        }
    }
    
    //first telex from seed will establish our identity
    if (!self.me && telex._to) {
        self.me = slib.getSwitch(telex._to);
        self.me.self = true; // flag switch to not send to itself
        clearTimeout(self.seedTimeout);
        delete self.seedTimeout;
        console.error("our ipp:",self.me.ipp,self.me.end);
        //delay...to allow time for SNAT detection (we need a response from another seed)
        setTimeout(function () {
            if (!self.snat && self.mode == MODE.FULL){
                 self.me.visible = true; //become visible (announce our-selves in .see commands)
                 //console.error('Making ourself Visible..');
            }
            self.state = STATE.online;
            console.error("going online","nat:",self.nat,"snat:",self.snat, "visible:", self.me.visible,"mode:", self.mode);
            if(self.nat) doPopTap(); //only needed if we are behind NAT
            if (self.onSeeded) self.onSeeded();
        }, 2000);
    }

    if (self.me && from == self.me.ipp) {
        console.error("self seeding.");
        self.seed = true;
    }

    if (telex._to && self.me && !self.snat && (util.IP(telex._to) == self.me.ip) && (self.me.ipp !== telex._to)) {
        //we are behind symmetric NAT
        //console.error("symmetric NAT detected.");
        self.snat = true;
        self.nat = true;
        self.me.visible = false; //hard to be seen behind an SNAT :(
        if(self.mode == MODE.FULL){
            self.mode = MODE.LISTENER;//drop functionality to LISTENER
        }
    }

    //mark seed as visible
    slib.getSwitch(from).visible = true;
    handleTelex(telex, from, len); //handle the .see from the seed - establish line
}

function handleTelex(telex, from, len) {
    if (self.me && from == self.me.ipp) return; //dont process packets that claim to be from us! (we could be our own seed)

    if (telex._to) {
        if (self.snat) {
            //_to will not match self.me.ipp because we are behind SNAT but at least ip should match
            if (self.me.ip != util.IP(telex._to)) return;
        } else {
            //_to must equal our ipp
            if (self.me.ipp != telex._to) return;
        }

    } else {

        return; //bad telex? - review the spec ....
    }
    
    /*  
        depending on the level of implementation (operation mode) of remote switch it is acceptable
        not to have a _ring,_line,_to header..  
    */    
    //if there is a _line in the telex we should already know them..
    if (telex._line) {
        if (!slib.knownSwitch(from)) return;
    } else {
        //if (!telex._ring) return;
    }

    slib.getSwitch(from).process(telex, len);
}

// process a validated telex that has signals,data and commands to be handled
// these would be signals we have .tap'ed for
function doSignals(from, telex) {
    //ignore .tap and .see (already handeled)
    if(telex['.tap'] || telex['.see']) return;
    
    if( handleConnectResponses(from,telex) ) return;//intercept +response signals
    if( handleConnects(from,telex)) return;//intercept +connect signals
    
    //look for listener .tapping signals in this telex and callback it's handler
    listeners.forEach(function (listener) {
        if( slib.ruleMatch(telex, listener.rule) && listener.cb ) listener.cb(from,telex);
    }); 
}

function timeoutResponseHandlers(){
    for (var guid in responseHandlers){
        if( Date.now() > responseHandlers[guid].timeout ) {
            if(responseHandlers[guid].callback) responseHandlers[guid].callback(undefined);//always callback after timeout..
            delete responseHandlers[guid];
        }
    }
}

function handleConnects(from,telex){
    //return an object containing the message and a function to send reply
    //the reply function will send via relay if direct is not possible
    //indicate in object which type of reply will occur!
    if(!telex['+connect']) return false;
    
    listeners.forEach(function (listener) {

        if( slib.ruleMatch(telex, listener.rule) && listener.cb ) {
            listener.cb({
                guid:telex['+connect'],
                message:telex['+message'],
                from:telex['+from'],
                source:from.ipp,                
                // always return via relay signals..
                reply:function(message){
                    if(!telex['+from']) return;//if they didn't send us their end we can't reply
                    from.send({
                        '+end': telex['+from'],
                        '+message': message,
                        '+response': telex['+connect'],
                        '_hop':1
                    });
                },
                send:function(ipp,message){
                    doSend(ipp, {
                        '+message': message,
                        '+response': telex['+connect']
                    }); //direct telex
                }
            });
        }
    }); 
    return true;
}
function handleConnectResponses(from,telex){

    if (telex['+response']) {
        //this would be a telex +reponse to our outgoing +connect (could be direct or relayed)
        for (var guid in responseHandlers) {
            if (guid == telex['+response'] && responseHandlers[guid].callback ) {
                responseHandlers[guid].responses++;
                responseHandlers[guid].callback({from:from.ipp, message:telex['+message'], count:responseHandlers[guid].responses});
                return true;
            }
        }
        return true;
    }
    return false;
}

function sendPOPRequest(ipp) {
    slib.getSwitch(ipp).popped = true;
    if (self.snat) return; //pointless
    doAnnounce(ipp,{'+pop': 'th:' + self.me.ipp});
}

function doNews(s) {
    //new .seen switch    
    if(self && self.me){
      //console.error("Pinging New switch: ",s.ipp);
      if(s.via){
        s.popped = true;
        doSend(s.via,{
            '+end': s.end,
            '+pop':'th:'+self.me.ipp,
            '_hop':1
        });           
      }
      
      doPing(s.ipp);//will pop if required..              
    }
    
    // TODO if we're actively listening, and this is closest yet, ask it immediately
}

function doPopTap() {
    if( self.mode == MODE.ANNOUNCER) return;
    
    if (self.nat && !self.snat) {
        //console.error("Tapping +POPs...");
        listeners.push({
            hash: self.me.hash,
            end: self.me.end,
            rule: {
                'is': {
                    '+end': self.me.end
                },
                'has': ['+pop']
            }
        });
        //sendTapRequests(true);        
    }
}

function listenForResponse(arg, callback) {
    if(self.mode == MODE.ANNOUNCER) return;
    var end = new hlib.Hash(arg.id); //end we are tapping for
    var hash = new hlib.Hash(arg.connect); //where we will .tap
    var rule = {
        'is': {
            '+end': end.toString()
        },
        'has': ['+response']
    };
    var listener = {
        id: arg.id,
        hash: hash,
        end: end.toString(),
        rule: rule,
        cb: callback,
        far: true
    };
    listeners.push(listener);
    //listenLoop();//kick start far listeners to get our responses from first time.
    return listener;
}

// setup a listener for the hash of arg.id
// we want to receive telexe which have a +connect signal in them.
function doListen(id, callback) {
    if (!self.me) return;
    if (self.mode == MODE.ANNOUNCER ) return;
    //add a listener for arg.id 
    var hash = new hlib.Hash(id);
    var rule = {
        'is': {
            '+end': hash.toString()
        },
        'has': ['+connect']
    };
    
    doTap(id, rule, callback);
}

function listenLoop() {
    if (self && self.state != STATE.online) return;
    if (self.mode == MODE.ANNOUNCER) return;
    
    var count = 0;
    //look for closer switches
    listeners.forEach(function (listener) {
        count++;
        //console.error(count + ":LISTENER:" + JSON.stringify(listener.rule));
        
        slib.getNear(listener.hash).forEach(function (ipp) {
            doSend(ipp, {
                '+end': listener.end
            });
        });
        
        //doDial( listener.id ); //<<--not using this so we can support the listenforrespone.. where listener.end != listener.hash
    });
    sendTapRequests();
}

//TODO: from telehash.org/proto.html, under section common patterns:.. then send a .tap of which Signals to observe to those Switches close to the End along with some test Signals, who if willing will respond with process the .tap and immediately send the matching Signals back to confirm that it's active.
function sendTapRequests( noRateLimit ) {
//TODO make sure to only .tap visible switches..
    var limit = noRateLimit ? false : true;
    var tapRequests = {}; //hash of .tap arrays indexed by switch.ipp 
    //loop through all listeners and aggregate the .tap rules for each switch
    listeners.forEach(function (listener) {
        var switches = slib.getNear(listener.hash);
        switches.forEach(function (s) {
            if (!tapRequests[s]) tapRequests[s] = [];
            tapRequests[s].push(listener.rule);
        });
    });
    
    Object.keys(tapRequests).forEach(function (ipp) {
        var s = slib.getSwitch(ipp);
        if (!s.line) return; //only send out the .tap request if we have a line open
        //don't send .tap too often.. need to allow time to get closer to the end we are interested in
        if (limit && s.lastTapRequest && (s.lastTapRequest + 40000 > Date.now())) return;
        doSend(ipp, {
            '.tap': tapRequests[ipp]
        });
        if(limit) s.lastTapRequest = Date.now();
    });
}

//setup a connector to indicate what ends we want to communicate with
//only one connector per end is created. The connectors role is to constantly dial the end only
//returns the connector object used to actually send signals to the end.
function doConnect(end_name, noResponse) {
    if (!self.me) return;
    if (self.state != STATE.online ) return;
    
    if( connectors[end_name] ) return connectors[end_name];
        
    connectors[end_name] = {
        id: end_name,
        snat: (self.snat ? true : false ),//indicator if we are behind snat
        send:function(message, callback, timeOut){
                var guid = nextGUID();//new guid for message -- RANDOM NUMBER
                if(callback && self.mode != MODE.ANNOUNCER ){//dont setup a response handler if we are not interested in a response!                
                    responseHandlers[guid]={ 
                        callback: callback, //add a handler for the responses
                        timeout: timeOut? Date.now()+(timeOut*1000):Date.now()+(10*1000),  //responses must arrive within timeOut seconds, or default 10 seconds
                        responses:0 //tracks number of responses to the outgoing telex.
                    };
                }     
                //send the message
                if(callback && !noResponse && self.mode != MODE.ANNOUNCER ){
                    //changed to send end instead of ip:port. (maintain some anonymity)
                    //if ip:port needs to be shared..send it in the message.
                    doAnnounce(end_name, {'+connect':guid,'+from':self.me.end,'+message':message});
                }else{
                    //dont share our ip.. if we dont have to
                    doAnnounce(end_name, {'+connect':guid,'+message':message});
                }
                //console.error("Sending message: " + JSON.stringify(message)+" guid:"+guid);
            }
    };

    if(self.mode != MODE.ANNOUNCER && !noResponse ){
        listenForResponse({
            id: self.me.ipp,
            connect: end_name
        }, undefined);
    }

    //console.error("ADDED CONNECTOR TO: " + end_name);
    connectLoop(); //kick start connector
    
    return connectors[end_name];
}

function connectLoop() {
    if (self && self.state != STATE.online) return;
    
    timeoutResponseHandlers();
    
    // dial the end continuously, timer to re-dial closest, wait forever for response and call back
    for (var end in connectors) {
        doDial( end );
    }
}
//some lower level functions
function doTap(end, rule, callback){
    if(self.mode == MODE.ANNOUNCER) return;
    var hash = new hlib.Hash(end);
    var listener = {
        id: end,
        hash: hash,
        end: hash.toString(),
        rule: rule,
        cb: callback
    };
    listeners.push(listener);
    //console.error("ADDED LISTENER FOR: "+end);
    return listener;
}


function doAnnounce(end, signals){
    if (self.snat) signals['+snat'] = true;
    signals['_hop'] = 1;
    var hash = new hlib.Hash(end);
    signals['+end']=hash.toString();
    var switches = slib.getNear(hash);
    switches.forEach(function (ipp) {
        doSend(ipp,signals);//fix: signals telex is being altered.. need to make a copy of telex before sending to multiple switches
    });
}

function doDial( end ){
    var hash = new hlib.Hash(end);
    var switches = slib.getNear(hash);
    switches.forEach(function (ipp) {
        doSend(ipp, {
            '+end': hash.toString(),
            '_hop':0
        });
    });
    return hash.toString();
}

function doPing(to){
    doSend(to, {
        '+end': self.me.end,
        '_hop': 0,
        '.see': self.me.visible ? [self.me.ipp] : []
    });
}

function doSend(to, telex) {
    //if behind NAT, don't send to a switch with the same ip as us
    //if a NAT/firewall supports 'hair-pinning' we could allow it
    if (self.nat) {
        if (self.me && util.isSameIP(self.me.ipp, to)) return;
    }

    var s = slib.getSwitch(to);

    //eliminate duplicate +end dial signals going to same switch in short-span of time.
    if (telex['+end'] && (!telex['_hop'] || telex['_hop']==0)) {
        var end = telex['+end'];
        if (!s.pings) s.pings = {}; //track last ping time, indexed by +end hash
        if (s.pings[end] && ((s.pings[end] + 15000) > Date.now())) return;
        s.pings[end] = Date.now();
    }

    if (s.popped || self.snat) {
        s.send(telex);
    } else {
        //we need to +pop it, first time connecting..
        sendPOPRequest(to);
        //give the +pop signal a head start before we send out the telex
        setTimeout(function () { 
            s.send(telex);
        }, 2000);//too long?
    }
}

function doShutdown() {
    self.mode = MODE.offline;
    clearTimeout(self.scanTimeout);
    clearInterval(self.connect_listen_Interval);
    if (self.seedTimeout) {
        self.onSeeded("shutdown"); // a callback still waiting?!
        delete self.seedTimeout;
    }
    // drop all switches
    slib.getSwitches().forEach(function (s) {
        s.drop()
    });
    self.server.close();
    self = undefined;
    listeners = [];
    connectors = {};
    responseHandlers = {};
}

function connect_listen() {
    if (self && self.state != STATE.online) return;
    listenLoop();
    connectLoop();
}

// scan all known switches regularly to keep a good network map alive and trim the rest
function scan() {
    if (self.state != STATE.online) return;

    if (!this.count) this.count = 1;

    var all = slib.getSwitches();
    console.error("------" + this.count++);

    // first just cull any not healthy, easy enough
    all.forEach(function (s) {
        if (!s.healthy()) s.drop();
    });

    all = slib.getSwitches();

    all.forEach(function (s) {
        if (s.self) return;
        console.error("switch:",s.ipp,"visible:",s.visible,"line:",s.line,"misses:",s.misses,"healthy:",s.healthy());
    });

    // if only us or nobody around, and we were seeded at one point, try again!
    // unless we are the seed..    
    if(all.length <= 1 && !self.seed )
    {	//We probably lost our internet connection at this point.. or maybe
        //it just got disrupted:(DSL/pppoE DHCP lease renewed, if on a mobile we changed cells, signal lost etc..
        self.state = STATE.offline;
        return doSeed(self.onSeeded);//TODO: emit event state changed..
    }

    //if we lost connection to all initial seeds.. ping them all again?
    var foundSeed = false;
    all.forEach(function (s) {
        if (s.seed) foundSeed = true;
    });
    if (!foundSeed) {
        pingSeeds();
    }

    if(!self.mode == MODE.FULL) return;
        
    // TODO overall, ping first X of each bucket
    all = all.filter(function(a){
        return (a.visible && !a.self);
    });
    all.sort(function (a, b) {
        return self.me.hash.distanceTo(a.hash) - self.me.hash.distanceTo(b.hash);
    });

    if(!all.length) return;

    // create array of arrays (buckets) based on distance from self (the heart of kademlia)
    var distance = self.me.hash.distanceTo(all[0].hash); // first bucket
    var buckets = [];
    var bucket = [];
    all.forEach(function (s) {
        var d2 = self.me.hash.distanceTo(s.hash);
        if (d2 == distance) {
            console.error(s.ipp,'bucket:',buckets.length,"distance:",distance);
            return bucket.push(s);
        }
        buckets.push(bucket);//store bucket
        
        distance = d2;        
        bucket = [s];//put it in next bucket
        console.error(s.ipp,'bucket:',buckets.length,"distance:",distance);
    });

    // TODO for congested buckets have a sort preference towards stable, and have a max cap and drop rest (to help avoid a form of local flooding)
    // for now, ping everyone!
    buckets.forEach(function (bucket) {
        bucket.forEach(function (s) {
            if (s.self) return;
            if (Date.now() > (s.ATsent + 30000)) return; // don't need to ping if already sent them something in the last 30sec
            console.error('pinging ' + s.ipp + " ...");
            doPing(s.ipp);
            // TODO, best dht mesh balance is probably to generate a random hash this distance away, but greedy +end of us is always smart/safe
        })
    });
}

//http://comments.gmane.org/gmane.comp.lang.javascript.nodejs/2378
function randomString(bits){
  var chars,rand,i,ret;
  chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  ret='';
  // in v8, Math.random() yields 32 pseudo-random bits
  while(bits > 0){
    rand=Math.floor(Math.random()*0x100000000) // 32-bit integer
    // base 64 means 6 bits per character, so we use the top 30 bits from rand to give 30/6=5 characters.
    for(i=26; i>0 && bits>0; i-=6, bits-=6){ ret+=chars[0x3F & rand >>> i]; }
  }
  return ret
}
  
function nextGUID(){
    return randomString(64);
}

});

require.define("/index.js",function(require,module,exports,__dirname,__filename,process,global){bundle_require = require;


});
require("/index.js");
})();
