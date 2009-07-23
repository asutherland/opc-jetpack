#! /usr/bin/env python

import os
import sys

if __name__ == '__main__':
    # This code is run if we're executed directly from the command-line.

    myfile = os.path.abspath(__file__)
    mydir = os.path.dirname(myfile)
    sys.path.insert(0, os.path.join(mydir, 'python-modules'))

    args = sys.argv[1:]
    if not args:
        args = ['help']

    # Have paver run this very file as its pavement script.
    args = ['-f', myfile] + args

    import paver.tasks
    paver.tasks.main(args)
    sys.exit(0)

# This code is run if we're executed as a pavement script by paver.

import os
import sys
import fnmatch
import distutils.dir_util
import xml.dom.minidom
import zipfile
import shutil
import distutils.dir_util
import time
import threading
import subprocess
import simplejson
from ConfigParser import ConfigParser

from paver.easy import *

# Path to the root of the extension, relative to where this script is
# located.
EXT_SUBDIR = "extension"

def clear_dir(dirname):
    if os.path.exists(dirname) and os.path.isdir(dirname):
        shutil.rmtree(dirname)

def find_profile_dir(name):
    """
    Given the name of a Firefox profile, attempts to find the absolute
    path to its directory.  If it can't be found, None is returned.
    """

    base_path = None
    if sys.platform == "darwin":
        base_path = os.path.expanduser(
            "~/Library/Application Support/Firefox/"
            )
    elif sys.platform.startswith("win"):
        # TODO: This only works on 2000/XP/Vista, not 98/Me.
        appdata = os.environ["APPDATA"]
        base_path = os.path.join(appdata, "Mozilla\\Firefox")
    elif sys.platform == "cygwin":
        appdata = os.environ["APPDATA"]
        base_path = os.path.join(appdata, "Mozilla\\Firefox")
    else:
        base_path = os.path.expanduser("~/.mozilla/firefox/")
    inifile = os.path.join(base_path, "profiles.ini")
    config = ConfigParser()
    config.read(inifile)
    profiles = [section for section in config.sections()
                if section.startswith("Profile")]
    for profile in profiles:
        if config.get(profile, "Name") == name:
            # TODO: Look at IsRelative?
            path = config.get(profile, "Path")
            if not os.path.isabs(path):
                path = os.path.join(base_path, path)
            return path
    return None

def get_install_rdf_dom(path_to_ext_root):
    rdf_path = os.path.join(path_to_ext_root, "install.rdf")
    rdf = xml.dom.minidom.parse(rdf_path)
    return rdf

def get_install_rdf_property(path_to_ext_root, property):
    rdf = get_install_rdf_dom(path_to_ext_root)
    element = rdf.documentElement.getElementsByTagName(property)[0]
    return element.firstChild.nodeValue

def resolve_options(options, ext_subdir = EXT_SUBDIR):
    if not options.get('profile'):
        options.profile = 'default'

    options.my_dir = os.path.dirname(os.path.abspath(options.pavement_file))
    options.profile_dir = find_profile_dir(options.profile)
    options.path_to_ext_root = os.path.join(options.my_dir, ext_subdir)

    options.ext_id = get_install_rdf_property(options.path_to_ext_root,
                                              "em:id")

    options.ext_version = get_install_rdf_property(options.path_to_ext_root,
                                                   "em:version")

    options.ext_name = get_install_rdf_property(options.path_to_ext_root,
                                                "em:name")

    if options.profile_dir:
        options.extension_file = os.path.join(options.profile_dir,
                                              "extensions",
                                              options.ext_id)
        # If cygwin, change the path to windows format so firefox can
        # understand it.
        if sys.platform == "cygwin":
            # TODO: Will this work if path_to_ext_root has spaces in it?
            file = 'cygpath.exe -w ' + options.path_to_ext_root
            path = "".join(os.popen(file).readlines())
            path = path.replace("\n", " ").rstrip()
            options.firefox_path_to_ext_root = path
        else:
            options.firefox_path_to_ext_root = options.path_to_ext_root

def remove_extension(options):
    if not (options.profile_dir and
            os.path.exists(options.profile_dir) and
            os.path.isdir(options.profile_dir)):
        raise BuildFailure("Can't resolve profile directory; aborting.")

    files_to_remove = ["compreg.dat", "xpti.dat"]
    for filename in files_to_remove:
        abspath = os.path.join(options.profile_dir, filename)
        if os.path.exists(abspath):
            os.remove(abspath)
    if os.path.exists(options.extension_file):
        if os.path.isdir(options.extension_file):
            shutil.rmtree(options.extension_file)
        else:
            os.remove(options.extension_file)

INSTALL_OPTIONS = [("profile=", "p", "Profile name.")]
JSBRIDGE_OPTIONS = [("port=", "p", "Port to use for jsbridge communication."),
                    ("binary=", "b", "Path to Firefox binary.")]

@task
@cmdopts(INSTALL_OPTIONS)
def install(options):
    """Install the extension to a Firefox profile."""

    resolve_options(options)
    remove_extension(options)

    extdir = os.path.dirname(options.extension_file)
    if not os.path.exists(extdir):
        distutils.dir_util.mkpath(extdir)
    fileobj = open(options.extension_file, "w")
    fileobj.write(options.firefox_path_to_ext_root)
    fileobj.close()

    copy_libs(options)

    print "Extension '%s' installed to profile '%s'." % (options.ext_id,
                                                         options.profile)

@task
@cmdopts(INSTALL_OPTIONS)
def uninstall(options):
    """Uninstall the extension from a Firefox profile."""

    resolve_options(options)
    remove_extension(options)
    print "Extension '%s' uninstalled from profile '%s'." % (options.ext_id,
                                                             options.profile)

@task
def xpi(options):
    """Build a distributable xpi installer for the extension."""

    resolve_options(options)

    platforms = os.listdir(os.path.join(options.my_dir, "lib"))

    for platform in platforms:
        zfname = "%s-%s-%s.xpi" % (options.ext_name.lower(),
                                   options.ext_version,
                                   platform)
        copy_libs(options, platform)
        zf = zipfile.ZipFile(zfname, "w", zipfile.ZIP_DEFLATED)
        for dirpath, dirnames, filenames in os.walk(options.path_to_ext_root):
            if platform in dirnames:
                # We're in the extension/platform directory, get rid of files for
                # other platforms.
                dirnames[:] = [platform]
            for filename in filenames:
                abspath = os.path.join(dirpath, filename)
                arcpath = abspath[len(options.path_to_ext_root)+1:]
                zf.write(abspath, arcpath)
        print "Created %s." % zfname

def start_jsbridge(options):
    import mozrunner
    import jsbridge

    resolve_options(options)

    if not options.get('port'):
        options.port = '24242'
    options.port = int(options.port)
    options.binary = options.get('binary')

    plugins = [jsbridge.extension_path, options.path_to_ext_root]
    profile = mozrunner.FirefoxProfile(
        plugins=plugins,
        preferences={'browser.startup.homepage' : 'about:blank',
                     'startup.homepage_welcome_url' : 'about:blank'}
        )
    runner = mozrunner.FirefoxRunner(profile=profile,
                                     binary=options.binary,
                                     cmdargs=["-jsbridge", str(options.port)])
    runner.start()

    back_channel, bridge = jsbridge.wait_and_create_network("127.0.0.1",
                                                            options.port)

    return Bunch(back_channel = back_channel,
                 bridge = bridge,
                 runner = runner)

def start_jetpack(options, listener):
    remote = start_jsbridge(options)

    import jsbridge

    code = (
        "((function() { var extension = {}; "
        "Components.utils.import('resource://jetpack/modules/init.js', "
        "extension); return extension; })())"
        )

    remote.back_channel.add_global_listener(listener)
    extension = jsbridge.JSObject(remote.bridge, code)

    INTERVAL = 0.1
    MAX_STARTUP_TIME = 5.0

    is_done = False
    time_elapsed = 0.0

    try:
        while not is_done:
            time.sleep(INTERVAL)
            time_elapsed += INTERVAL

            if time_elapsed > MAX_STARTUP_TIME:
                raise Exception('Maximum startup time exceeded.')

            url = 'chrome://jetpack/content/index.html'
            window = extension.get(url)
            if window is None:
                #print "Waiting for index to load."
                continue        
            if hasattr(window, 'frameElement'):
                #print "Window is in an iframe."
                continue
            if window.closed:
                #print "Window is closed."
                continue
            if not hasattr(window, 'JSBridge'):
                #print "window.JSBridge does not exist."
                continue
            if not window.JSBridge.isReady:
                #print "Waiting for about:jetpack to be ready."
                continue
            is_done = True
    except:
        remote.runner.stop()
        raise

    remote.window = window
    return remote

@task
@cmdopts(JSBRIDGE_OPTIONS)
def run(options):
    """Run Firefox in a temporary new profile with the extension installed."""

    remote = start_jsbridge(options)

    try:
        print "Now running, press Ctrl-C to stop."
        remote.runner.wait()
    except KeyboardInterrupt:
        print "Received interrupt, stopping."
        remote.runner.stop()

@task
@cmdopts(JSBRIDGE_OPTIONS)
def render_docs(options):
    """Render the API and tutorial documentation in HTML format,
    and output it to the website directory."""
    
    # TODO: Render tutorial docs too (bug 496457).

    TEMPLATE = os.path.join("website", "templates", "api.html")
    OUTPUT = os.path.join("website", "api.html")

    done_event = threading.Event()
    result = Bunch()

    def listener(event_name, obj):
        if event_name == 'jetpack:result':
            result.update(obj)
            done_event.set()

    MAX_RENDER_RUN_TIME = 10.0

    remote = start_jetpack(options, listener)

    try:
        remote.window.JSBridge.renderDocs()
        done_event.wait(MAX_RENDER_RUN_TIME)
        if not done_event.isSet():
            raise Exception('Maximum render run time exceeded.')
    finally:
        remote.runner.stop()

    template = open(TEMPLATE).read();
    template = template.replace(
        "[[CONTENT]]",
        result.apiHtml.encode("ascii", "xmlcharrefreplace")
        )
    open(OUTPUT, "w").write(template)
    print "Wrote API docs to %s using template at %s." % (OUTPUT,
                                                          TEMPLATE)

@task
@cmdopts(JSBRIDGE_OPTIONS +
         [("filter=", "f",
           "Run only test suites containing the given string.")])
def test(options):
    """Run unit and functional tests."""

    done_event = threading.Event()
    result = Bunch()

    def listener(event_name, obj):
        if event_name == 'jetpack:message':
            if obj.get('isWarning', False):
                print "[WARNING]: %s" % obj['message']
            elif obj.get('isError', False):
                print "[ERROR]  : %s" % obj['message']
            else:
                print "[message]: %s" % obj['message']
            if obj.get('sourceName'):
                print "           %s:L%s" % (obj['sourceName'],
                                             obj.get('lineNumber', '?'))
        elif event_name == 'jetpack:result':
            result.obj = obj
            done_event.set()

    MAX_TEST_RUN_TIME = 25.0

    remote = start_jetpack(options, listener)

    try:
        remote.window.JSBridge.runTests(options.get("filter"))
        done_event.wait(MAX_TEST_RUN_TIME)
        if not done_event.isSet():
            raise Exception('Maximum test run time exceeded.')
    finally:
        remote.runner.stop()

    print "Tests failed: %d" % result.obj['failed']
    print "Tests succeeded: %d" % result.obj['succeeded']

    if result.obj['failed'] > 0:
        sys.exit(result.obj['failed'])

@task
def clean(options):
    """Removes all intermediate and non-essential files."""

    resolve_options(options)
    clear_dir(os.path.join(options.path_to_ext_root, "lib"))

    EXTENSIONS_TO_REMOVE = [".pyc", ".orig"]

    for dirpath, dirnames, filenames in os.walk(os.getcwd()):
        if ".hg" in dirnames:
            dirnames.remove(".hg")
        for filename in filenames:
            fullpath = os.path.join(dirpath, filename)
            ext = os.path.splitext(filename)[1]
            if ext in EXTENSIONS_TO_REMOVE:
                os.remove(fullpath)

def run_program(args, **kwargs):
    retval = subprocess.call(args, **kwargs)
    if retval:
        print "Process failed with exit code %d." % retval
        sys.exit(retval)

def copy_libs(options, platform = None):
    """Copy the platform-specific dynamic library files from our versioned
    repository into the extension's temporary directory."""

    if platform is None:
        if sys.platform == "darwin":
            platform = "Darwin_x86-gcc3"
        elif sys.platform.startswith("linux"):
            platform = "Linux_x86-gcc3"
        else:
            # Assume Windows.
            platform = "WINNT_x86-msvc"
    src_dir = os.path.join(options.my_dir, "lib", platform)
    dest_dir = os.path.join(options.path_to_ext_root, "lib")
    clear_dir(dest_dir)
    shutil.copytree(src_dir, dest_dir)

@task
@cmdopts([("srcdir=", "t", "The root of your mozilla-central checkout"),
          ("objdir=", "o", "The root of your objdir")])
def xpcom(options):
    """Builds binary XPCOM components for Jetpack."""

    for option in ["srcdir", "objdir"]:
        if not options.get(option):
            raise Exception("Please specify a value for the '%s' option." %
                            option)

    for dirname in ["srcdir", "objdir"]:
        options[dirname] = os.path.expanduser(options[dirname])
        options[dirname] = os.path.abspath(options[dirname])

    resolve_options(options)
    options.xpcshell = os.path.join(options.objdir, "dist", "bin",
                                    "xpcshell")

    xpcom_info = Bunch()
    xpcom_info.components_dir = os.path.join(options.objdir, "dist",
                                             "bin", "components")

    autoconf = open(os.path.join(options.objdir, "config", "autoconf.mk"),
                    "r").readlines()
    for line in autoconf:
        if line.startswith("OS_TARGET"):
            xpcom_info.os = line.split("=")[1].strip()
        elif line.startswith("TARGET_XPCOM_ABI"):
            xpcom_info.abi = line.split("=")[1].strip()
        elif line.startswith("MOZILLA_VERSION"):
            xpcom_info.mozilla_version = line.split("=")[1].strip()
        elif (line.startswith("MOZ_DEBUG") and
              not line.startswith("MOZ_DEBUG_")):
            raw_value = line.split("=")[1].strip()
            if not raw_value:
                xpcom_info.is_debug = 0
            else:
                xpcom_info.is_debug = int(raw_value)

    platform = "%(os)s_%(abi)s" % xpcom_info
    print "Building XPCOM binary components for %s" % platform

    comp_src_dir = os.path.join(options.my_dir, "components")
    rel_dest_dir = os.path.join("browser", "components", "jetpack")
    comp_dest_dir = os.path.join(options.srcdir, rel_dest_dir)
    comp_xpi_dir = os.path.join(options.objdir, "dist", "xpi-stage",
                                "jetpack", "components")
    comp_plat_dir1 = os.path.join(options.my_dir, "lib",
                                  platform, xpcom_info.mozilla_version)
    comp_plat_dir2 = os.path.join(options.path_to_ext_root, "lib",
                                  xpcom_info.mozilla_version)

    clear_dir(comp_dest_dir)
    clear_dir(comp_xpi_dir)

    shutil.copytree(comp_src_dir, comp_dest_dir)

    # Ensure that these paths are unix-like on Windows.
    sh_pwd = subprocess.Popen(["sh", "-c", "pwd"],
                              cwd=options.srcdir,
                              stdout=subprocess.PIPE)
    sh_pwd.wait()
    unix_topsrcdir = sh_pwd.stdout.read().strip()
    unix_rel_dest_dir = rel_dest_dir.replace("\\", "/")

    # We're specifying 'perl' here because we have to for this
    # to work on Windows.
    run_program(["perl",
                 os.path.join(options.srcdir, "build", "autoconf",
                              "make-makefile"),
                 "-t", unix_topsrcdir,
                 unix_rel_dest_dir],
                cwd=options.objdir)

    run_program(["make"],
                cwd=os.path.join(options.objdir, rel_dest_dir))

    xptfiles = []
    libfiles = []
    for filename in os.listdir(comp_xpi_dir):
        if fnmatch.fnmatch(filename, '*.xpt'):
            xptfiles.append(filename)
        else:
            libfiles.append(filename)

    def copy_libs(dest_dir):
        clear_dir(dest_dir)
        distutils.dir_util.mkpath(dest_dir)
        for filename in libfiles:
            shutil.copy(os.path.join(comp_xpi_dir, filename),
                        dest_dir)

    if not xpcom_info.is_debug:
        copy_libs(comp_plat_dir1)
    copy_libs(comp_plat_dir2)

    for filename in xptfiles:
        shutil.copy(os.path.join(comp_xpi_dir, filename),
                    os.path.join(options.path_to_ext_root, "components"))

    for filename in os.listdir(comp_xpi_dir):
        shutil.copy(os.path.join(comp_xpi_dir, filename),
                    xpcom_info.components_dir)

    for filename in ["compreg.dat", "xpti.dat"]:
        fullpath = os.path.join(xpcom_info.components_dir, filename)
        if os.path.exists(fullpath):
            os.unlink(fullpath)

    # Now run unit tests via xpcshell.

    run_program([options.xpcshell,
                 os.path.join(options.my_dir, "extension",
                              "content", "test-wrapper.js")],
                cwd=os.path.dirname(options.xpcshell))
