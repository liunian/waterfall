<?php

$result = array();
$items = array();

for ($i=1; $i <= 15; $i++) { 
    $item = array();
    $h = rand(200, 400);
    $item['src'] = "http://lorempixel.com/200/$h/";
    $item['h'] = $h;
    
    $items[] = $item;
}


$result['items'] = $items;
	
echo json_encode($result);
?>
