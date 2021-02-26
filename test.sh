#!/bin/sh
$(dirname $0)/compile.sh
python3 -m http.server