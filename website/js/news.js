(function(){

var messages = [
  'Take the <a href="http://design-challenge.mozillalabs.com/jetpack-for-learning/">Jetpack for Learning Design Challenge</a> to advanced online learning.',
  'Enter the <a href="http://mozillalabs.com/blog/2010/01/jetpack-50-line-code-challenge-winner-is-crowned/">Jetpack 50-line Challenge Winner Announced!</a>',
  '<a href="http://mozillalabs.com/blog/2009/11/announcing-jetpack-0-6-jetpack-gallery/">Jetpack 0.7</a> adds a First-Run experience API.</li>',
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