(function doThing() {
   var graph = {};
   var rejectedTypes = {};
   var INTERESTING_TYPES = [
     'Object', 'Function', 'Call', 'Window', 'Array', 'RegExp',
     'Block', 'Date', 'String', 'StopIteration', 'Iterator',
     'Error', 'Math', 'JSON', 'Boolean', 'With', 'Number',
     'XML', 'Script', 'CanvasRenderingContext2D',
     'PageTransitionEvent', 'MouseEvent',
     'Location', 'Navigator', 'Generator', 'XPCNativeWrapper',
     'XPCSafeJSObjectWrapper', 'XPCCrossOriginWrapper'
     ];
   var interestingTypes = {};
   INTERESTING_TYPES.forEach(
     function(name) { interestingTypes[name] = true; }
   );

   var table = getObjectTable();
   for (id in table) {
     var nativeClass = table[id];
     if ((nativeClass in interestingTypes) ||
         (nativeClass.indexOf('HTML') == 0) ||
         (nativeClass.indexOf('DOM') == 0) ||
         (nativeClass.indexOf('XPC_WN_') == 0)) {
       var info = getObjectInfo(parseInt(id));
       graph[id] = info;
     } else {
       if (!(nativeClass in rejectedTypes))
         rejectedTypes[nativeClass] = true;
     }
   }

   var rejectedList = [];
   for (name in rejectedTypes)
     rejectedList.push(name);
   return JSON.stringify({graph: graph,
                          rejectedTypes: rejectedList});
 })();
