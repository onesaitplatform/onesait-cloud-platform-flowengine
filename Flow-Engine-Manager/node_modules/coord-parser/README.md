# coord-parser
[![NPM version](http://img.shields.io/npm/v/coord-parser.svg?style=flat)](https://www.npmjs.org/package/coord-parser)
[![Build Status](https://travis-ci.org/naturalatlas/coord-parser.svg)](https://travis-ci.org/naturalatlas/coord-parser)
[![Coverage Status](http://img.shields.io/codecov/c/github/naturalatlas/coord-parser/master.svg?style=flat)](https://codecov.io/github/naturalatlas/coord-parser)

`coord-parser` is a DMS coordinate parsing library designed to handle very rough / mangled user input. It's a re-write of Gregor MacLennan's [`parse-dms`](https://github.com/gmaclennan/parse-dms). If you notice something it can't parse, open an issue or pull request.

```sh
$ npm install coord-parser --save
```

### Usage

```js
var parse = require('coord-parser');

parse('59°12\'7.7“N 02°15\'39.6“W');
parse('N59°12\'7.7" W02°15\'39.6"');
parse('-2.1S-1.1E');
parse('2N,1');
```

## Contributing

Before submitting pull requests, please update the [tests](test) and make sure they all pass.

```sh
$ npm test
```

## License

The MIT License (MIT)

Copyright &copy; 2015 Natural Atlas, Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
