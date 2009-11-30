(function(){

var messages = [
  'Take the <a href="http://design-challenge.mozillalabs.com/jetpack-for-learning/">Jetpack for Learning Design Challenge</a> to advanced online learning.',
  'Enter the <a href="http://mozillalabs.com/jetpack/2009/11/13/jetpack-50-line-code-challenge/">Jetpack 50-line Challenge</a>. Win a netbook.',
  '<a href="http://mozillalabs.com/blog/2009/11/announcing-jetpack-0-6-jetpack-gallery/">Jetpack 0.6</a> adds two major APIs.</li>',
  'Jetpack 0.6.2 just released. Brings the built-in Bespin editor to Windows and Linux.',
  'The <a href="http://jetpackgallery.mozillalabs.com">Jetpack Gallery</a> is now up! Add your Jetpack for maximum exposure.'
];

var current = -1;
var msgSelector = ".news #msg";

function animate(){
	$( msgSelector )
		.css({position:"relative"})
		.animate({left:"+=20px", opacity:0}, 300, function(){ $(msgSelector).html( messages[current] ) })
		.animate({left:"-=40px"}, 10)
		.animate({left:"+=20px", opacity:1}, 300)
		
	current = (current+1) % messages.length;
}

animate();
setInterval( animate, 5000 );


})();