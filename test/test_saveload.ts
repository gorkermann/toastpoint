import { TestFuncs, Test, Result, TestReport, 
		 runTestsAsync } from '../lib/TestRun.js'
import * as tp from '../toastpoint.js'

import fs from 'fs'

class A {
	b: B = null;
	cc: Array<B> = [];
	x: string = 'x';

	constructor() {}
}

class Loop {
	other: Loop = null;

	constructor( other: Loop ) {
		this.other = other;
	}
}

class B {
	a: A = null;
	b: B = null;
	x: string = '';
	l1: Loop;
	l2: Loop;

	constructor() {
		this.a = null;
		this.b = this;
		this.x = Math.random().toFixed( 3 );

		// create a pointer loop that should be avoided by the loader
		this.l1 = new Loop( null );
		this.l2 = new Loop( this.l1 );
		this.l1.other = this.l2;
	}

	toJSON( toaster: tp.Toaster ): any {
		let flat: any = {};

		tp.setJSON( flat, 'a', this.a, toaster );
		tp.setJSON( flat, 'b', this.b, toaster );
		tp.setJSON( flat, 'x', this.x, toaster );

		return flat;
	}
}

class C extends B {
	y: number = 0;

	constructor() {
		super();
		this.y = Math.floor( Math.random() * 10 );
	}

	toJSON( toaster: tp.Toaster ): any {
		let flat: any = super.toJSON( toaster );

		tp.setJSON( flat, 'y', this.y, toaster );
		
		return flat;
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

let list_basic = 
	[null, false, 0, '', 1, 'a',
	 [], {},
	 [1, 'b', 3]];

let list_obj = 
	[{ x: 'a', y: 2, z: 'c' },
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

let factory = function( newable: any ): () => any {
	return () => {
		let obj = new newable();
		return obj;
	}
}

let constructors = { 'A': factory( A ), 
				  	 'B': factory( B ),
					 'C': factory( C ),
					 'Loop': factory( Loop ) };

function saveload( obj: any ): boolean {
	let json = tp.listToJSON( obj, constructors );
	let before = tp.log.TRAIL;

	let toaster = new tp.Toaster( constructors )
	let obj2 = tp.fromJSON( json, toaster );

	let after = tp.log.TRAIL;

	let result = tp.checkStructure( obj, obj2, [], [] );

	if ( !result ) {
		console.log( 'before:\n' + before + '\nafter:\n' + after );
	}

	return result;
}

function test_saveload_basic( tf: TestFuncs ) {
	tf.ASSERT( saveload( list_basic ) );
}

function test_saveload_obj( tf: TestFuncs ) {
	tf.ASSERT( saveload( list_obj ) );
}

let tests: Array<Test> = [];

tests.push( new Test( 'saveload_basic', 
						test_saveload_basic,
						[] ) );

tests.push( new Test( 'saveload_obj', 
						test_saveload_obj,
						[] ) );

let report = new TestReport();
runTestsAsync( tests, true, report ).then( function() {
	report.print();
} );
