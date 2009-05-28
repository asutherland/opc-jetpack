#! /usr/bin/env python

import os
import sys

mydir = os.path.dirname(os.path.abspath(__file__))

sys.path.insert(0, os.path.join(mydir, "python-modules"))

import paver.tasks
paver.tasks.main()
