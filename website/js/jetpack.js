function gotHereByNavbar(){
  // All navbar links add a # to the end of the URL so we
  // know if the user got here by clicking on a nav link.
  return document.location.toString().match(/#$/) != null;
}

function ScrollBelowHeader(){
  if( gotHereByNavbar() ){
    var scrollPos = $("#menu").offset().top-20;    
    window.scroll(0, scrollPos);
  }
}

ScrollBelowHeader();