import { TestFuncs, TestRun, Test } from '../lib/TestRun.js'
import * as tp from '../toastpoint.js'

import fs from 'fs'

class A {
	b: B = null;
	cc: Array<B> = [];
	x: string = 'x';

	constructor() {}
}

class B {
	a: A = null;
	b: B = null;
	x: string = '';

	constructor() {
		this.a = null;
		this.b = this;
		this.x = Math.random().toFixed( 3 );
	}
}

class C extends B {
	y: number = 0;

	constructor() {
		super();
		this.y = Math.floor( Math.random() * 10 );
	}
}

let a1 = new A();
let b1 = new B();
let b2 = new B();
let c1 = new C();

a1.b = b1;
a1.cc = [b1, b2, c1];

b1.a = a1;
b1.b = b1;

c1.a = null;
c1.b = b2;

let obj = [ null, false, 0, '',
			1, 'a',
			[], {},
			[1, 'b', 3],
			{ x: 'a', y: 2, z: 'c' },
		    a1, b1, b2, c1 ];

/*
function test_checkstructure() {
	let a1 = new A();
	a1.b = null;

	let a2 = new A();
	a2.b = new B();
	a2.b.x = '0';

	ASSERT( !tp.checkStructure( a1, a2, [], [] ) );

	a1.b = new B();
	a1.b.x = '0';

	ASSERT( tp.checkStructure( a1, a2, [], [] ) );


	a1.cc = [1]
	a2.cc = [1, 2];

	ASSERT( !tp.checkStructure( a1, a2, [], [] ) )

	a1.cc = [1, 2];
	a2.cc = [1];

	ASSERT( !tp.checkStructure( a1, a2, [], [] ) );


	a1.cc = { x: 1 };
	a2.cc = { y: 1 };

	ASSERT( !tp.checkStructure( a1, a2, [], [] ) );

	a1.cc = { x: 1 };
	a2.cc = { x: 1 };

	ASSERT( tp.checkStructure( a1, a2, [], [] ) );	
}*/

function test_saveload( tf: TestFuncs ) {
	let constructors = { 'A': A, 'B': B, 'C': C };

	let json = tp.listToJSON( obj, constructors );
	let before = tp.log.TRAIL;

	let idIndex: Array<any> = [];
	let obj2 = tp.fromJSON( json, constructors, idIndex );
	let after = tp.log.TRAIL;

	tp.resolveList( [obj2], constructors, idIndex );

	let result = tp.checkStructure( obj, obj2, [], [] );

	if ( !result ) {
		console.log( before + '\n\n' + after );
	}

	tf.ASSERT( result );

	tf.wait( () => {} );
}

let t = new TestRun( null, [] );

t.tests.push( new Test( 'saveload', 
						test_saveload,
						[] ) );

t.run();


			
