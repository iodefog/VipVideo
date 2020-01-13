//
//  HLCollectionViewItem.m
//  VipVideo
//
//  Created by 李红力 on 2020/1/10.
//  Copyright © 2020 SV. All rights reserved.
//

#import "HLCollectionViewItem.h"

@implementation NSVideoButton

@end


@interface HLCollectionViewItem ()

@end

@implementation HLCollectionViewItem
@dynamic selected;

- (void)viewDidLayout{
    [super viewDidLayout];
    self.button.frame = CGRectMake(5, 5, CGRectGetWidth(self.view.bounds)-10, CGRectGetHeight(self.view.bounds)-10);
}

- (void)viewDidLoad {
    [super viewDidLoad];
    // Do view setup here.
    
    self.button = [[NSVideoButton alloc] init];
//    [self.button setBezelStyle:NSBezelStyleShadowlessSquare];
    self.button.target = self;
    self.button.action = @selector(buttonClicked:);
    
    [self.view addSubview:self.button];

}

- (void)setObject:(VipUrlItem *)object{
//    self.textLabel.stringValue = object.title;
    self.button.title = object.title;
}

- (void)buttonClicked:(NSVideoButton *)sender{
    if (self.itemBlock) {
        self.itemBlock(self.object);
    }
    sender.highlighted = YES;
    sender.layer.backgroundColor = [NSColor blueColor].CGColor;
    [sender setNeedsDisplay:YES];
    self.view.layer.backgroundColor = [NSColor blueColor].CGColor;
    [self.view setNeedsDisplay:YES];

//    self.highlightState = NSCollectionViewItemHighlightForSelection;
}


@end
