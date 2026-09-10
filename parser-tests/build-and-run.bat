@echo off
cd /d c:\Paanam
node parser-tests/gen-fixtures.mjs
node_modules\.bin\esbuild.cmd src\utils\investmentParser.ts --bundle --format=esm --platform=node --external:xlsx --external:mammoth --alias:pdfjs-dist=./node_modules/pdfjs-dist/legacy/build/pdf.mjs --outfile=parser-tests/parser.bundle.mjs --log-level=warning
node parser-tests/run-tests.mjs
