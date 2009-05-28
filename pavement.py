import os
import sys
import xml.dom.minidom
import zipfile
import shutil
import distutils.dir_util
import time
import threading
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

    zfname = "%s-%s.xpi" % (options.ext_name.lower(), options.ext_version)
    zf = zipfile.ZipFile(zfname, "w", zipfile.ZIP_DEFLATED)
    for dirpath, dirnames, filenames in os.walk(options.path_to_ext_root):
        for filename in filenames:
            abspath = os.path.join(dirpath, filename)
            arcpath = abspath[len(options.path_to_ext_root)+1:]
            zf.write(abspath, arcpath)
    print "Created %s." % zfname

options(virtualenv = Bunch(packages_to_install=['jsbridge', 'simplejson'],
                           no_site_packages=True))

def start_jsbridge(options):
    HELP_MSG = ["",
                "Please run the following command:",
                "",
                "  python bootstrap.py --no-site-packages --clear",
                "",
                "This will install a sandboxed Python environment in ",
                "this directory. To activate the environment, run ",
                "'source bin/activate', and then run this command again.",
                "",
                "If you ever need to deactivate the sandboxed Python ",
                "environment, just run 'deactivate'."]
    HELP_MSG = "\n".join(HELP_MSG)

    try:
        import pkg_resources

        try:
            pkg_resources.require('jsbridge>=2.0b1')
        except pkg_resources.VersionConflict:
            raise BuildFailure("\nYou have an incompatible version of " +
                               "jsbridge.\n" + HELP_MSG)

        import mozrunner
        import jsbridge
    except ImportError:
        raise BuildFailure(HELP_MSG)

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
def render_api_docs(options):
    """Render the API documentation in HTML format."""

    done_event = threading.Event()
    result = Bunch()

    def listener(event_name, obj):
        if event_name == 'jetpack:result':
            result.html = obj
            done_event.set()

    MAX_RENDER_RUN_TIME = 10.0

    remote = start_jetpack(options, listener)

    try:
        remote.window.JSBridge.renderApiDocs()
        done_event.wait(MAX_RENDER_RUN_TIME)
        if not done_event.isSet():
            raise Exception('Maximum render run time exceeded.')
    finally:
        remote.runner.stop()

    print result.html

@task
@cmdopts(JSBRIDGE_OPTIONS)
def test(options):
    """Run test suite."""

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
        remote.window.JSBridge.runTests()
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
def build_bootstrap_script(options):
    """Builds a bootstrap script with virtualenv in it."""

    import paver.virtual

    if paver.virtual.has_virtualenv:
        paver.virtual.bootstrap()
    else:
        raise BuildFailure("virtualenv must be installed.")
